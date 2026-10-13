/**
 * One shared Postgres LISTEN connection per process, fanned out to all SSE subscribers.
 * Reconnects with backoff; on reconnect subscribers get a synthetic "resync" event so clients refetch.
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

interface BusState {
  client: pg.Client | null;
  connecting: Promise<void> | null;
  subscribers: Set<Subscriber>;
  retry: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  shuttingDown: boolean;
  hadConnection: boolean;
}

const g = globalThis as typeof globalThis & { __fmpBus?: BusState };
const state: BusState = (g.__fmpBus ??= {
  client: null,
  connecting: null,
  subscribers: new Set(),
  retry: 0,
  retryTimer: null,
  shuttingDown: false,
  hadConnection: false,
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
  if (state.shuttingDown || state.retryTimer || state.subscribers.size === 0) return;
  const delay = Math.min(30_000, 500 * 2 ** state.retry++);
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    void ensureListening();
  }, delay);
}

async function connect(): Promise<void> {
  const client = new pg.Client({ connectionString: env.databaseUrl, keepAlive: true });
  client.on("notification", (msg) => {
    if (msg.channel === CHANNEL && msg.payload) broadcast(msg.payload);
  });
  const onLost = (err?: unknown) => {
    if (state.client !== client) return;
    if (err) console.error("[realtime] LISTEN connection lost", err);
    state.client = null;
    client.removeAllListeners();
    client.end().catch(() => undefined);
    scheduleReconnect();
  };
  client.on("error", onLost);
  client.on("end", () => onLost());
  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  state.client = client;
  state.retry = 0;
  if (state.hadConnection) broadcast("resync"); // events may have been missed while disconnected
  state.hadConnection = true;
}

/** Ensure the shared LISTEN connection is up (idempotent). */
export async function ensureListening(): Promise<void> {
  if (state.client || state.shuttingDown) return;
  if (!state.connecting) {
    state.connecting = connect()
      .catch((err) => {
        console.error("[realtime] LISTEN connect failed", err);
        scheduleReconnect();
      })
      .finally(() => {
        state.connecting = null;
      });
  }
  await state.connecting;
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
    await c.end().catch(() => undefined);
  }
}

/** Reset after shutdown (tests only). */
export function __resetRealtimeForTests() {
  state.shuttingDown = false;
  state.hadConnection = false;
  state.retry = 0;
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
