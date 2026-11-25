/**
 * One shared Postgres LISTEN connection per process, fanned out to all SSE subscribers.
 *
 * Handshake contract (docs/API.md "Realtime"): a subscriber only gets `hello` once this process is LISTENing, so
 * every change committed after the client's `hello` is guaranteed to reach it. Whenever the LISTEN connection is
 * (re-)established, every subscriber gets a synthetic "resync" (the SSE route turns it into `hello` for streams that
 * have not had one yet, `resync` otherwise) so clients refetch whatever they may have missed.
 *
 * The connection is kept up for the whole process lifetime once started (also with zero subscribers) so
 * /api/health can report it. When it is lost it reconnects FOREVER with capped exponential backoff + jitter
 * (0.5 s → 30 s); every attempt (connect + LISTEN) is time-boxed, so a hung attempt can never stall the loop.
 * /api/health and new SSE streams may bring a scheduled attempt forward (at most one attempt per 2 s, one in flight).
 * It is probed every 30 s by re-issuing `LISTEN <channel>` (an idempotent no-op round trip) to detect half-open
 * TCP connections — which also keeps `pg_stat_activity.query` showing `LISTEN …` for this session.
 *
 * Logging is deliberately sparse: the loss once, failed attempts 1, 2, 4, 8, … , and the re-established LISTEN once.
 */
import pg from "pg";
import { env } from "../env";
import { CHANNEL } from "../notify";

export interface Subscriber {
  /** Raw JSON payload from NOTIFY, or the string "resync". */
  send: (payload: string) => void;
  /** Close the stream (shutdown). */
  close: () => void;
}

export const RESYNC = "resync";
const PROBE_INTERVAL_MS = 30_000;
const PROBE_TIMEOUT_MS = 10_000;
/** Upper bound for one reconnect attempt (TCP connect + auth + LISTEN). */
const ATTEMPT_TIMEOUT_MS = 15_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;
/** Health checks / new SSE streams may bring a scheduled retry forward, but at most this often. */
const MIN_EARLY_RETRY_GAP_MS = 2_000;

interface BusState {
  client: pg.Client | null;
  connecting: Promise<void> | null;
  subscribers: Set<Subscriber>;
  retry: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  probeTimer: ReturnType<typeof setInterval> | null;
  shuttingDown: boolean;
  started: boolean;
  /** ms timestamp since when LISTEN has been down (null while listening, or before the first start). */
  downSince: number | null;
  /** Failed connect attempts since LISTEN was last up (for sparse logging). */
  failures: number;
  /** Tests only: make the next N connect attempts fail. */
  failNext: number;
  /** ms timestamp of the last connect attempt or connection loss. */
  lastAttemptAt: number;
}

const g = globalThis as typeof globalThis & { __fmpBus?: BusState };
const state: BusState = (g.__fmpBus ??= {
  client: null,
  connecting: null,
  subscribers: new Set(),
  retry: 0,
  retryTimer: null,
  probeTimer: null,
  shuttingDown: false,
  started: false,
  downSince: null,
  failures: 0,
  failNext: 0,
  lastAttemptAt: 0,
});
state.failures ??= 0; // (dev hot reload: state object created by an older module version)
state.failNext ??= 0;
state.lastAttemptAt ??= 0;

function broadcast(payload: string) {
  for (const s of state.subscribers) {
    try {
      s.send(payload);
    } catch {
      /* subscriber gone; its own cleanup removes it */
    }
  }
}

/** Capped exponential backoff with "equal jitter": [cap/2, cap) where cap = min(30 s, 0.5 s · 2^retry). */
export function backoffDelay(retry: number, random: () => number = Math.random): number {
  const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(retry, 16));
  return Math.round(cap / 2 + random() * (cap / 2));
}

function scheduleReconnect() {
  if (state.shuttingDown || state.retryTimer) return;
  const delay = backoffDelay(state.retry++);
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    void ensureListening();
  }, delay);
  state.retryTimer.unref?.();
}

function stopProbe() {
  if (state.probeTimer) clearInterval(state.probeTimer);
  state.probeTimer = null;
}

/** Detach and close a client without ever waiting for it (end() can stay pending on a dead socket). */
function discard(client: pg.Client) {
  client.removeAllListeners();
  client.on("error", () => undefined); // swallow late socket errors after removal
  client.end().catch(() => undefined);
}

function markLost(client: pg.Client, err?: unknown) {
  if (state.client !== client) return;
  console.error("[realtime] LISTEN connection lost", err ? ((err as Error)?.message ?? err) : "(connection ended)", "- reconnecting");
  state.client = null;
  state.downSince ??= Date.now();
  state.lastAttemptAt = Date.now();
  stopProbe();
  discard(client);
  scheduleReconnect();
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timeout after ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function startProbe(client: pg.Client) {
  stopProbe();
  state.probeTimer = setInterval(() => {
    if (state.client !== client) return stopProbe();
    // Re-issuing LISTEN is an idempotent round trip; it also keeps pg_stat_activity.query = "LISTEN …".
    withTimeout(client.query(`LISTEN ${CHANNEL}`), PROBE_TIMEOUT_MS, "LISTEN probe").catch((err) => markLost(client, err));
  }, PROBE_INTERVAL_MS);
  state.probeTimer.unref?.();
}

async function connect(): Promise<void> {
  state.lastAttemptAt = Date.now();
  if (state.failNext > 0) {
    state.failNext--;
    throw new Error("test: injected connect failure");
  }
  const client = new pg.Client({
    connectionString: env.databaseUrl,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  client.on("notification", (msg) => {
    if (msg.channel === CHANNEL && msg.payload) broadcast(msg.payload);
  });
  try {
    client.on("error", (err) => markLost(client, err));
    client.on("end", () => markLost(client));
    await withTimeout(
      (async () => {
        await client.connect();
        await client.query(`LISTEN ${CHANNEL}`);
      })(),
      ATTEMPT_TIMEOUT_MS,
      "LISTEN connect",
    );
  } catch (err) {
    discard(client); // never await end(): a half-open socket must not stall the reconnect loop
    throw err;
  }
  if (state.shuttingDown) {
    discard(client);
    return;
  }
  const wasDownMs = state.downSince === null ? 0 : Date.now() - state.downSince;
  const attempts = state.failures + 1;
  const reconnected = state.retry > 0 || state.failures > 0;
  state.client = client;
  state.retry = 0;
  state.failures = 0;
  state.downSince = null;
  if (reconnected) {
    console.log(`[realtime] LISTEN ${CHANNEL} re-established after ${(wasDownMs / 1000).toFixed(1)} s (attempt ${attempts})`);
  }
  startProbe(client);
  // Every (re)connect: streams waiting for their handshake get `hello`, the others `resync` (refetch).
  broadcast(RESYNC);
}

/** Ensure the shared LISTEN connection is up (idempotent). Resolves when it is up OR the attempt failed. */
export async function ensureListening(): Promise<void> {
  if (state.shuttingDown) return;
  if (!state.started) {
    state.started = true;
    state.downSince ??= Date.now();
  }
  if (state.client) return;
  // A reconnect is scheduled: health checks / new SSE streams may bring it forward (so recovery after a long DB
  // outage does not wait for a 30 s backoff step), but never more often than every 2 s.
  if (state.retryTimer) {
    if (Date.now() - state.lastAttemptAt < MIN_EARLY_RETRY_GAP_MS) return;
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
  }
  if (!state.connecting) {
    state.connecting = connect()
      .catch((err) => {
        const n = ++state.failures;
        if ((n & (n - 1)) === 0) {
          // 1, 2, 4, 8, … — sparse, but a long outage still shows up in the log
          console.error(`[realtime] LISTEN connect failed (attempt ${n}, retrying with backoff)`, (err as Error)?.message ?? err);
        }
        scheduleReconnect();
      })
      .finally(() => {
        state.connecting = null;
      });
  }
  await state.connecting;
}

/** Whether this process currently has a working LISTEN connection. */
export function isListening(): boolean {
  return state.client !== null;
}

/** LISTEN status for /api/health. */
export function realtimeStatus(now: number = Date.now()): { listening: boolean; started: boolean; downForMs: number | null } {
  return {
    listening: state.client !== null,
    started: state.started,
    downForMs: state.client || state.downSince === null ? null : now - state.downSince,
  };
}

export function subscribe(sub: Subscriber): () => void {
  state.subscribers.add(sub);
  void ensureListening();
  return () => {
    state.subscribers.delete(sub);
  };
}

export function subscriberCount(): number {
  return state.subscribers.size;
}

/** Close every SSE stream and the LISTEN connection (SIGTERM → fast blue-green cutover). */
export async function shutdownRealtime(): Promise<void> {
  state.shuttingDown = true;
  if (state.retryTimer) clearTimeout(state.retryTimer);
  state.retryTimer = null;
  stopProbe();
  for (const s of [...state.subscribers]) {
    try {
      s.close();
    } catch {
      /* ignore */
    }
  }
  state.subscribers.clear();
  const c = state.client;
  state.client = null;
  if (c) {
    c.removeAllListeners();
    c.on("error", () => undefined);
    await c.end().catch(() => undefined);
  }
}

/** Reset after shutdown (tests only). */
export function __resetRealtimeForTests() {
  state.shuttingDown = false;
  state.started = false;
  state.downSince = null;
  state.retry = 0;
  state.failures = 0;
  state.failNext = 0;
}

/** Tests only: make the next `n` connect attempts fail (as if the DB were unreachable). */
export function __failNextConnectsForTests(n: number) {
  state.failNext = n;
}

/** Tests only: whether a reconnect timer / probe timer is pending. */
export function __pendingTimersForTests(): { retry: boolean; probe: boolean } {
  return { retry: state.retryTimer !== null, probe: state.probeTimer !== null };
}

/** Tests only: simulate a lost LISTEN connection (as if the DB dropped it). */
export function __dropListenConnectionForTests() {
  if (state.client) markLost(state.client, new Error("test drop"));
}

let handlersInstalled = false;
/**
 * On SIGTERM/SIGINT close SSE streams + LISTEN connection right away so the HTTP server can drain quickly.
 * Next's standalone server also handles these signals and exits; we only make sure long-lived streams do not block it.
 */
export function installShutdownHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  const onSignal = (sig: NodeJS.Signals) => {
    console.log(`[realtime] ${sig}: closing ${state.subscribers.size} SSE stream(s)`);
    void shutdownRealtime();
    // Safety net: Next's own handler exits once the server has drained; never hang a rollout.
    setTimeout(() => process.exit(sig === "SIGTERM" ? 143 : 130), 10_000).unref();
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
}
