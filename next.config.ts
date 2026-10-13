import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // pg uses optional native bindings; keep it external to the server bundle.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
