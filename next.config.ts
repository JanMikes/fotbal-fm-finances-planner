import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy for app pages. The app is a statically prerendered SPA shell, so a per-request nonce is
 * not possible; Next's inline bootstrap scripts need 'unsafe-inline' in script-src. Everything else is locked to
 * our own origin (no third-party scripts/styles/fonts, no framing, no plugins, no <base> tricks, forms only to self).
 * blob: for local attachment previews before upload; data: for small inline images.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const COMMON_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // no-referrer everywhere (also keeps the magic-link token out of any Referer header)
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Optional override so several local `next dev` instances can run side by side (each needs its own dir / lock).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // pg uses optional native bindings; keep it external to the server bundle.
  serverExternalPackages: ["pg"],
  experimental: {
    // Every request the proxy runs for has its body buffered in memory up to this size. All proxied bodies are
    // small JSON / login forms; the 25 MB upload endpoint (/api/attachments) is excluded from the proxy matcher
    // and streams to disk instead (src/server/services/attachments.ts).
    proxyClientMaxBodySize: "1mb",
  },
  async headers() {
    return [
      { source: "/:path*", headers: COMMON_HEADERS },
      // pages only — API responses set their own (the attachment file route has a stricter sandbox CSP)
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: CSP }] },
    ];
  },
};

export default nextConfig;
