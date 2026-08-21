import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = [
  "index.html",
  "assets/auth-bootstrap.js",
  "assets/app.js",
  "assets/dashboard-runtime.js",
  "assets/styles.css",
  "scripts/build-secure-site.mjs",
  "supabase/migrations/202608130001_multi_brand_diagnosis_platform.sql",
  "supabase/migrations/202608130002_scope_snapshots_to_workspaces.sql",
  "supabase/migrations/202608140001_source_facts_snapshot.sql",
  "supabase/migrations/202608210001_competitor_link_tracking.sql",
  "scripts/import-competitor-links.mjs",
  "scripts/collect-competitor-snapshots.mjs",
  "scripts/publish-competitor-snapshots.mjs"
  ,"scripts/competitor-bridge.mjs"
];

for (const relativePath of requiredFiles) await access(resolve(root, relativePath));

const runtime = await readFile(resolve(root, "assets/dashboard-runtime.js"), "utf8");
const appSource = await readFile(resolve(root, "assets/app.js"), "utf8");
const indexHtml = await readFile(resolve(root, "index.html"), "utf8");
const authBootstrap = await readFile(resolve(root, "assets/auth-bootstrap.js"), "utf8");

const assertions = [
  [runtime.includes("$(\".listing-table .sort-button\").forEach"), "dashboard-runtime.js still uses forEach on a single-element selector"],
  [runtime.includes("periodLinks") && runtime.includes("periodLabels"), "period diagnosis logic is missing"],
  [appSource.includes("importShopeeBatch") && appSource.includes("normalizeProductPerformance") && appSource.includes("normalizeSupportingReport") && appSource.includes("Product_Model ID") && appSource.includes("importedLinkKey") && appSource.includes('report.status !== "blocked"'), "Shopee batch preflight logic is missing"],
  [appSource.includes("source-task-column") && appSource.includes("sourceStatus") && appSource.includes("Gross Sales(Local currency)"), "source diagnosis integration is missing"],
  [authBootstrap.includes('"sourceFacts"') && authBootstrap.includes("snapshot.sourceFacts"), "source facts cloud persistence is missing"],
  [indexHtml.includes("shopeeBatchFileInput") && indexHtml.includes("batchImportStatus"), "Shopee batch import UI is missing"],
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

const failedAssertions = assertions.filter(([condition]) => !condition);
if (failedAssertions.length) {
  for (const [, message] of failedAssertions) console.error(`Validation failed: ${message}`);
  process.exitCode = 1;
} else {
  console.log(`Validation passed: ${requiredFiles.length} files and ${assertions.length} contracts checked.`);
}
