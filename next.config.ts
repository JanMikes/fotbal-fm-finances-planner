import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Optional override so several local `next dev` instances can run side by side (each needs its own dir / lock).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // pg uses optional native bindings; keep it external to the server bundle.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
