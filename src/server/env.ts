/**
 * Server environment. In production APP_PASSWORD / APP_ACCESS_TOKEN / SESSION_SECRET / DATABASE_URL are required
 * (checked at startup by src/instrumentation.ts). Outside production, dev defaults are used so `npm run dev` works.
 */
const DEV_DEFAULTS = {
  DATABASE_URL: "postgresql://planner:planner@localhost:54329/planner",
  APP_PASSWORD: "dev-password",
  APP_ACCESS_TOKEN: "dev-token",
  SESSION_SECRET: "dev-session-secret-change-me-0000000000",
} as const;

export const REQUIRED_PROD_ENV = ["DATABASE_URL", "APP_PASSWORD", "APP_ACCESS_TOKEN", "SESSION_SECRET"] as const;

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

/** Names of required variables that are missing (production startup check). */
export function missingProductionEnv(): string[] {
  const missing: string[] = REQUIRED_PROD_ENV.filter((k) => !process.env[k]?.trim());
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 16) missing.push("SESSION_SECRET (min 16 chars)");
  return missing;
}
