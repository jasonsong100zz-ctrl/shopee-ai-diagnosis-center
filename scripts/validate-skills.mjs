import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const runFile = promisify(execFile);
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const skillsRoot = join(repositoryRoot, "skills");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^['\"]|['\"]$/g, "") : "";
}

async function validateSkill(skillDirectory) {
  const skillId = skillDirectory.split(/[\\/]/).pop();
  const skillFile = join(skillDirectory, "SKILL.md");
  const interfaceFile = join(skillDirectory, "agents", "openai.yaml");
  const errors = [];
  if (!(await exists(skillFile))) errors.push("missing SKILL.md");
  if (!(await exists(interfaceFile))) errors.push("missing agents/openai.yaml");
  if (errors.length) return { skillId, errors };

  const skillContent = await readFile(skillFile, "utf8");
  const interfaceContent = await readFile(interfaceFile, "utf8");
  const declaredName = frontmatterValue(skillContent, "name");
  const description = frontmatterValue(skillContent, "description");
  if (!skillContent.startsWith("---")) errors.push("SKILL.md must start with YAML frontmatter");
  if (declaredName !== skillId) errors.push(`frontmatter name must equal folder: ${declaredName || "missing"}`);
  if (!description) errors.push("description is missing");
  if (!interfaceContent.includes("display_name:")) errors.push("agents/openai.yaml is missing display_name");
  if (/TODO|TBD|<your-/.test(skillContent)) errors.push("unfinished placeholder found");

  const entries = await readdir(join(skillDirectory, "scripts"), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".mjs")) continue;
    const scriptPath = join(skillDirectory, "scripts", entry.name);
    try {
      await runFile(process.execPath, ["--check", scriptPath]);
    } catch (error) {
      errors.push(`syntax error in ${entry.name}: ${error.message}`);
    }
  }
  return { skillId, errors };
}

const skillEntries = await readdir(skillsRoot, { withFileTypes: true });
const skillDirectories = skillEntries.filter((entry) => entry.isDirectory()).map((entry) => join(skillsRoot, entry.name));
const results = [];
for (const skillDirectory of skillDirectories) results.push(await validateSkill(skillDirectory));
const failures = results.filter((result) => result.errors.length);
for (const result of results) {
  const location = relative(repositoryRoot, join(skillsRoot, result.skillId));
  console.log(`${result.errors.length ? "FAIL" : "PASS"} ${location}${result.errors.length ? `: ${result.errors.join("; ")}` : ""}`);
}
if (failures.length) process.exit(1);
