import { cp, mkdir, rm } from "node:fs/promises";

const output = new URL("../dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  cp(new URL("../index.html", import.meta.url), new URL("index.html", output)),
  cp(new URL("../assets/", import.meta.url), new URL("assets/", output), { recursive: true }),
  cp(new URL("../_headers", import.meta.url), new URL("_headers", output)),
  cp(new URL("../.nojekyll", import.meta.url), new URL(".nojekyll", output))
]);
console.log("Secure site built in dist/ (raw data and source tables excluded).");


