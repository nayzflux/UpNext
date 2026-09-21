import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const environmentFile = resolve(process.cwd(), "../../.env");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const nextConfig: NextConfig = {
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
