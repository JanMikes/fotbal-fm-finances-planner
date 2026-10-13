import { subscribe } from "@/server/realtime/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events. Events:
 *   event: hello   data: {"ok":true}                      (on connect)
 *   event: change  data: {"entity","op","id","clientId"}  (after every committed mutation, any instance)
 *   event: resync  data: {}                               (server LISTEN connection was re-established → refetch)
 * Comment heartbeat every 25 s.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribe({
        send: (payload) => {
          if (payload === "resync") write(`event: resync\ndata: {}\n\n`);
          else write(`event: change\ndata: ${payload}\n\n`);
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
      write(`retry: 3000\nevent: hello\ndata: {"ok":true}\n\n`);
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
