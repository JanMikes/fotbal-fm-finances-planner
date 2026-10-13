/** Production startup checks: fail fast when required secrets are missing; install SIGTERM handling for SSE. */
import { missingProductionEnv } from "./server/env";
import { installShutdownHandlers } from "./server/realtime/bus";

if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  const missing = missingProductionEnv();
  if (missing.length) {
    console.error(`[startup] FATAL: missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
  installShutdownHandlers();
}
