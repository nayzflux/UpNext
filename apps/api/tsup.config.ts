import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  noExternal: ["@upnext/contracts"],
  clean: true,
  sourcemap: true,
});
