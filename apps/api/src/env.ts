import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { environmentSchema } from "./env-schema";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

export const env = environmentSchema.parse(process.env);
