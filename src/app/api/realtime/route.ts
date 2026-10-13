import { ensureListening, isListening, RESYNC, subscribe } from "@/server/realtime/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events. Events (contract in docs/API.md):
 *   event: hello   data: {"ok":true}                      sent only once this process is LISTENing → client refetches
 *   event: change  data: {"entity","op","id","clientId"}  after every committed mutation, any instance
 *   event: resync  data: {}                               LISTEN connection was re-established → client refetches
 * Comment heartbeat every 25 s (also while waiting for the LISTEN connection).
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let helloSent = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const hello = () => {
        if (helloSent) return;
        helloSent = true;
        write(`event: hello\ndata: {"ok":true}\n\n`);
      };
      write(`retry: 3000\n\n`);
      const unsubscribe = subscribe({
        send: (payload) => {
          if (payload === RESYNC) {
            if (helloSent) write(`event: resync\ndata: {}\n\n`);
            else hello();
            return;
          }
          hello(); // (defensive) never deliver a change before the handshake
          write(`event: change\ndata: ${payload}\n\n`);
        },
        close: () => {
          cleanup();
        },
      });
      const heartbeat = setInterval(() => write(`: ping ${Date.now()}\n\n`), HEARTBEAT_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", () => cleanup(), { once: true });
      // Handshake only after LISTEN is up. If the connection attempt fails, the stream stays open (heartbeats)
      // and `hello` is sent by the bus's RESYNC broadcast when the reconnect succeeds.
      await ensureListening();
      if (isListening()) hello();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
