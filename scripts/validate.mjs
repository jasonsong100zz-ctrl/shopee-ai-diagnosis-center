import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = [
  "index.html",
  "assets/auth-bootstrap.js",
  "assets/app.js",
  "assets/styles.css",
  "scripts/build-secure-site.mjs"
];

for (const relativePath of requiredFiles) {
  await access(resolve(root, relativePath));
}

const indexHtml = await readFile(resolve(root, "index.html"), "utf8");
const authBootstrap = await readFile(resolve(root, "assets/auth-bootstrap.js"), "utf8");
const appSource = await readFile(resolve(root, "assets/app.js"), "utf8");

const assertions = [
  [indexHtml.includes("assets/auth-bootstrap.js?v="), "index.html must load the versioned auth bootstrap"],
  [authBootstrap.includes("./assets/app.js?v="), "auth bootstrap must load the canonical app runtime"],
  [authBootstrap.includes("validateSnapshotRecords(records)"), "cloud snapshots must be validated before rendering"],
  [authBootstrap.includes("await window.ShopeeDashboardReady"), "auth bootstrap must wait for dashboard initialization"],
  [appSource.includes("function setRoute"), "dashboard runtime must initialize hash routes"],
  [appSource.includes("function renderTasks"), "dashboard runtime must render the task board"],
  [appSource.includes("function renderSop"), "dashboard runtime must render the SOP module"],
  [appSource.includes("function renderGovernance"), "dashboard runtime must render governance controls"],
  [appSource.includes("function renderListingFilters"), "dashboard runtime must render listing filters"],
  [appSource.includes("function renderSubsidy"), "dashboard runtime must render subsidy allocations"]
];

const failed = assertions.filter(([condition]) => !condition);
if (failed.length) {
  for (const [, message] of failed) console.error(`Validation failed: ${message}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${requiredFiles.length} source files and ${assertions.length} dashboard contracts.`);
}
