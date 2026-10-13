/**
 * One shared Postgres LISTEN connection per process, fanned out to all SSE subscribers.
 *
 * Handshake contract (docs/API.md "Realtime"): a subscriber only gets `hello` once this process is LISTENing, so
 * every change committed after the client's `hello` is guaranteed to reach it. Whenever the LISTEN connection is
 * (re-)established, every subscriber gets a synthetic "resync" (the SSE route turns it into `hello` for streams that
 * have not had one yet, `resync` otherwise) so clients refetch whatever they may have missed.
 *
 * The connection is kept up for the whole process lifetime once started (also with zero subscribers) so
 * /api/health can report it; it reconnects with exponential backoff and is probed with `SELECT 1` every 30 s to
 * detect half-open TCP connections.
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
});

function broadcast(payload: string) {
  for (const s of state.subscribers) {
    try {
      s.send(payload);
    } catch {
      /* subscriber gone; its own cleanup removes it */
    }
  }
}

function scheduleReconnect() {
  if (state.shuttingDown || state.retryTimer) return;
  const delay = Math.min(30_000, 500 * 2 ** state.retry++);
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

function markLost(client: pg.Client, err?: unknown) {
  if (state.client !== client) return;
  if (err) console.error("[realtime] LISTEN connection lost", (err as Error)?.message ?? err);
  state.client = null;
  state.downSince ??= Date.now();
  stopProbe();
  client.removeAllListeners();
  client.on("error", () => undefined); // swallow late socket errors after removal
  client.end().catch(() => undefined);
  scheduleReconnect();
}

function startProbe(client: pg.Client) {
  stopProbe();
  state.probeTimer = setInterval(() => {
    if (state.client !== client) return stopProbe();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("LISTEN probe timeout")), PROBE_TIMEOUT_MS);
    });
    Promise.race([client.query("select 1"), timeout])
      .catch((err) => markLost(client, err))
      .finally(() => clearTimeout(timer));
  }, PROBE_INTERVAL_MS);
  state.probeTimer.unref?.();
}

async function connect(): Promise<void> {
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
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
  } catch (err) {
    client.removeAllListeners();
    client.on("error", () => undefined);
    await client.end().catch(() => undefined);
    throw err;
  }
  if (state.shuttingDown) {
    await client.end().catch(() => undefined);
    return;
  }
  state.client = client;
  state.retry = 0;
  state.downSince = null;
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
  if (!state.connecting) {
    state.connecting = connect()
      .catch((err) => {
        console.error("[realtime] LISTEN connect failed", (err as Error)?.message ?? err);
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
