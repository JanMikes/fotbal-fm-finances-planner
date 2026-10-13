/**
 * Server environment. In production APP_PASSWORD / APP_ACCESS_TOKEN / SESSION_SECRET / DATABASE_URL are required
 * and must be strong (checked at startup by src/instrumentation-node.ts → productionEnvProblems()). Outside
 * production, dev defaults are used so `npm run dev` works.
 */
const DEV_DEFAULTS = {
  DATABASE_URL: "postgresql://planner:planner@localhost:54329/planner",
  APP_PASSWORD: "dev-password",
  APP_ACCESS_TOKEN: "dev-token",
  SESSION_SECRET: "dev-session-secret-change-me-0000000000",
} as const;

/**
 * Publicly known values (this repo, compose.yml, .env.example, CI). Never acceptable in production — anyone who
 * knows SESSION_SECRET can mint cookies, anyone who knows the password/token can sign in.
 */
const PUBLIC_DEV_VALUES: ReadonlySet<string> = new Set([
  DEV_DEFAULTS.APP_PASSWORD,
  DEV_DEFAULTS.APP_ACCESS_TOKEN,
  DEV_DEFAULTS.SESSION_SECRET,
  "ci-session-secret-not-used-in-production-0000000000000000",
  "planner",
]);
const PUBLIC_DEV_PREFIXES = ["dev-session-secret", "ci-session-secret", "dev-password", "dev-token"];

export const REQUIRED_PROD_ENV = ["DATABASE_URL", "APP_PASSWORD", "APP_ACCESS_TOKEN", "SESSION_SECRET"] as const;

/** Minimum lengths enforced in production. */
export const MIN_LENGTH = { APP_PASSWORD: 8, APP_ACCESS_TOKEN: 32, SESSION_SECRET: 32 } as const;

type Key = keyof typeof DEV_DEFAULTS;

const isProd = () => process.env.NODE_ENV === "production";

function read(key: Key): string {
  const v = process.env[key];
  if (v && v.trim()) return v;
  if (isProd()) throw new Error(`Missing required environment variable ${key}`);
  return DEV_DEFAULTS[key];
}

export const env = {
  get databaseUrl() {
    return read("DATABASE_URL");
  },
  get appPassword() {
    return read("APP_PASSWORD");
  },
  get accessToken() {
    return read("APP_ACCESS_TOKEN");
  },
  get sessionSecret() {
    return read("SESSION_SECRET");
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR || (isProd() ? "/data/uploads" : "./data/uploads");
  },
};

/**
 * Local escape hatch for the zero-config `docker compose up` (production image with the public dev secrets).
 * Set ONLY by the repo's local compose.yml — never on lily.
 */
export function devSecretsAllowed(source: NodeJS.ProcessEnv = process.env): boolean {
  return source.ALLOW_DEV_SECRETS === "1";
}

function isPublicDevValue(v: string): boolean {
  return PUBLIC_DEV_VALUES.has(v) || PUBLIC_DEV_PREFIXES.some((p) => v.startsWith(p));
}

/**
 * Production startup check: names of variables that are missing or too weak (empty list = OK).
 * Never includes the values themselves.
 */
export function productionEnvProblems(source: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = REQUIRED_PROD_ENV.filter((k) => !source[k]?.trim()).map((k) => `${k} (missing)`);
  if (devSecretsAllowed(source)) return problems;
  for (const key of ["APP_PASSWORD", "APP_ACCESS_TOKEN", "SESSION_SECRET"] as const) {
    const v = source[key];
    if (!v?.trim()) continue;
    if (v.length < MIN_LENGTH[key]) problems.push(`${key} (min ${MIN_LENGTH[key]} chars)`);
    if (isPublicDevValue(v)) problems.push(`${key} (public dev default — generate a real secret)`);
  }
  return problems;
}

/** @deprecated use productionEnvProblems (kept for older imports). */
export const missingProductionEnv = productionEnvProblems;
