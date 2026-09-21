import { config } from "dotenv";

config({ path: ".env", quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("_test")) {
  throw new Error(
    "TEST_DATABASE_URL doit désigner une base dédiée dont le nom finit par _test.",
  );
}
process.env.DATABASE_URL = testUrl;
