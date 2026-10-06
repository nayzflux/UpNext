import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { createApiEnv } from "./env-schema";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

export const env = createApiEnv(process.env);
