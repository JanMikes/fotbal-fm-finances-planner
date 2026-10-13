/** Production startup checks: fail fast when secrets are missing/weak; install SIGTERM handling for SSE. */
import { devSecretsAllowed, productionEnvProblems } from "./server/env";
import { ensureListening, installShutdownHandlers } from "./server/realtime/bus";

if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  const problems = productionEnvProblems();
  if (problems.length) {
    console.error(`[startup] FATAL: invalid production environment: ${problems.join(", ")}`);
    process.exit(1);
  }
  if (devSecretsAllowed()) {
    console.warn("[startup] WARNING: ALLOW_DEV_SECRETS=1 — secret strength checks are disabled (local use only, never in production).");
  }
  installShutdownHandlers();
  // Start the shared LISTEN connection right away (health reports it; SSE handshakes wait for it).
  void ensureListening();
}
