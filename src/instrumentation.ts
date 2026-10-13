/** Startup hook. Node-only work lives in instrumentation-node.ts (keeps Node APIs out of the edge bundle). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
