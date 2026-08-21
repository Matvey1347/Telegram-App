import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const runtimeFile = ".env";
const templateFile = ".env.example";

if (existsSync(".env.prod")) {
  console.error(".env.prod is no longer supported; keep runtime values in .env.");
  process.exit(1);
}

for (const file of [runtimeFile, templateFile]) {
  if (!existsSync(file)) {
    console.error(`${file} is required for the unified environment profile.`);
    process.exit(1);
  }
}

function keys(file) {
  const result = [];
  const seen = new Set();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/u);
    if (!match) continue;
    if (seen.has(match[1])) {
      console.error(`${file} contains duplicate key ${match[1]}.`);
      process.exit(1);
    }
    seen.add(match[1]);
    result.push(match[1]);
  }
  return result;
}

const runtimeKeys = keys(runtimeFile);
const templateKeys = keys(templateFile);
const missingFromRuntime = templateKeys.filter(
  (key) => !runtimeKeys.includes(key),
);
const missingFromTemplate = runtimeKeys.filter(
  (key) => !templateKeys.includes(key),
);

if (missingFromRuntime.length || missingFromTemplate.length) {
  if (missingFromRuntime.length)
    console.error(`Missing from .env: ${missingFromRuntime.join(", ")}`);
  if (missingFromTemplate.length)
    console.error(
      `Missing from .env.example: ${missingFromTemplate.join(", ")}`,
    );
  process.exit(1);
}

if (runtimeKeys.join("\n") !== templateKeys.join("\n")) {
  console.error(".env and .env.example must keep keys in the same order.");
  process.exit(1);
}

const sections = (file) =>
  readFileSync(file, "utf8")
    .split(/\r?\n/u)
    .filter((line) => /^#\s+\S/u.test(line));
if (sections(runtimeFile).join("\n") !== sections(templateFile).join("\n")) {
  console.error(".env and .env.example must use the same section headings.");
  process.exit(1);
}

console.log(`Environment profile is synchronized (${runtimeKeys.length} keys).`);
