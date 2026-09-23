import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const environmentFile = resolve(webRoot, "../../.env");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: resolve(webRoot, "../.."),
  transpilePackages: ["@upnext/contracts"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:3001"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
