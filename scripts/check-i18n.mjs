import fs from "node:fs";
import path from "node:path";
import ts from "../apps/web/node_modules/typescript/lib/typescript.js";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesRoot = path.join(root, "apps/web/src/i18n/locales");
const sharedContractsFile = path.join(
  root,
  "packages/shared/src/i18n/contracts.ts",
);
const sharedContracts = fs.readFileSync(sharedContractsFile, "utf8");
const sharedNamespaceMatch = sharedContracts.match(
  /I18N_NAMESPACES\s*=\s*\[([\s\S]*?)\]\s*as const/,
);
if (!sharedNamespaceMatch)
  throw new Error("Could not read shared I18N_NAMESPACES");
const backendOnlyNamespaces = new Set(["telegram/system-bot", "notifications"]);
const runtimeNamespaces = [
  ...sharedNamespaceMatch[1].matchAll(/["']([^"']+)["']/g),
].map((match) => match[1]);
const namespaces = runtimeNamespaces
  .filter((namespace) => !backendOnlyNamespaces.has(namespace))
  .map((namespace) => `${namespace}.ts`);
const errors = [];
const allKeys = new Map();
function relativeTypeScriptFiles(directory) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith(".ts"))
        files.push(path.relative(directory, file));
    }
  }
  visit(directory);
  return files.sort();
}
const enCatalogFiles = relativeTypeScriptFiles(path.join(localesRoot, "en"));
const ruCatalogFiles = relativeTypeScriptFiles(path.join(localesRoot, "ru"));
const catalogFiles = enCatalogFiles;
for (const file of enCatalogFiles)
  if (!ruCatalogFiles.includes(file))
    errors.push(`Missing RU catalog file: ${file}`);
for (const file of ruCatalogFiles)
  if (!enCatalogFiles.includes(file))
    errors.push(`Missing EN catalog file: ${file}`);
for (const namespace of namespaces)
  if (!catalogFiles.includes(namespace))
    errors.push(`Registered namespace has no catalog: ${namespace}`);

function objectCatalog(file, variableName) {
  const source = fs.readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let catalog;
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (variableName && declaration.name.getText(parsed) !== variableName)
        continue;
      let value = declaration.initializer;
      while (
        value &&
        (ts.isAsExpression(value) || ts.isSatisfiesExpression(value))
      )
        value = value.expression;
      if (!value || !ts.isObjectLiteralExpression(value)) continue;
      catalog = new Map();
      for (const property of value.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const key = property.name.getText(parsed).replace(/^['"]|['"]$/g, "");
        const message = ts.isStringLiteralLike(property.initializer)
          ? property.initializer.text
          : "";
        if (catalog.has(key)) errors.push(`${file}: duplicate key ${key}`);
        catalog.set(key, message);
      }
    }
  }
  return catalog || new Map();
}

for (const [enRelative, ruRelative] of [
  [
    "apps/api/src/domains/telegram/telegram-system-bot/i18n/posts.en.ts",
    "apps/api/src/domains/telegram/telegram-system-bot/i18n/posts.ru.ts",
  ],
  [
    "apps/api/src/domains/telegram/telegram-system-bot/i18n/notifications.en.ts",
    "apps/api/src/domains/telegram/telegram-system-bot/i18n/notifications.ru.ts",
  ],
]) {
  const enFile = path.join(root, enRelative);
  const ruFile = path.join(root, ruRelative);
  const en = objectCatalog(enFile);
  const ru = objectCatalog(ruFile);
  for (const [key, message] of en) {
    if (!message.trim()) errors.push(`${enRelative}: empty value for ${key}`);
    if (!ru.has(key)) errors.push(`${ruRelative}: missing key ${key}`);
    else if (!ru.get(key).trim())
      errors.push(`${ruRelative}: empty value for ${key}`);
    else if (params(message) !== params(ru.get(key)))
      errors.push(`${ruRelative}: interpolation mismatch for ${key}`);
  }
  for (const key of ru.keys())
    if (!en.has(key)) errors.push(`${ruRelative}: extra key ${key}`);
}

function params(message) {
  return [...message.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(",");
}

for (const namespace of catalogFiles) {
  const enFile = path.join(localesRoot, "en", namespace);
  const ruFile = path.join(localesRoot, "ru", namespace);
  if (!fs.existsSync(enFile) || !fs.existsSync(ruFile)) {
    errors.push(`Missing namespace pair: ${namespace}`);
    continue;
  }
  const en = objectCatalog(enFile);
  const ru = objectCatalog(ruFile);
  for (const [key, message] of en) {
    if (allKeys.has(key))
      errors.push(
        `Duplicate full key ${key} in ${namespace} and ${allKeys.get(key)}`,
      );
    allKeys.set(key, namespace);
    if (!message.trim()) errors.push(`${namespace}: empty EN value for ${key}`);
    if (!ru.has(key)) errors.push(`${namespace}: missing RU key ${key}`);
    if (ru.has(key) && !ru.get(key).trim())
      errors.push(`${namespace}: empty RU value for ${key}`);
    if (ru.has(key) && params(message) !== params(ru.get(key)))
      errors.push(`${namespace}: interpolation mismatch for ${key}`);
  }
  for (const key of ru.keys())
    if (!en.has(key)) errors.push(`${namespace}: extra RU key ${key}`);
}

const registry = fs.readFileSync(
  path.join(root, "apps/web/src/i18n/registry.ts"),
  "utf8",
);
for (const match of registry.matchAll(/["']([a-z][a-z-/]+)["']/g)) {
  const file = `${match[1]}.ts`;
  if (match[1].includes("/") && !namespaces.includes(file))
    errors.push(`Registry references unknown namespace ${match[1]}`);
}

for (const constName of [
  "AUTH_ERROR_KEYS",
  "ACCOUNT_ERROR_KEYS",
  "TELEGRAM_AD_SALE_STATUS_KEYS",
  "TELEGRAM_AD_SALE_PAYMENT_STATUS_KEYS",
  "TELEGRAM_AD_PLACEMENT_STATUS_KEYS",
  "TELEGRAM_MANAGED_POST_STATUS_KEYS",
  "TELEGRAM_POST_GROUP_SYSTEM_TITLE_KEYS",
  "TELEGRAM_POSTS_ERROR_KEYS",
]) {
  const mapping = objectCatalog(sharedContractsFile, constName);
  if (!mapping.size) {
    errors.push(`Missing shared stable mapping ${constName}`);
    continue;
  }
  for (const key of mapping.values()) {
    if (!allKeys.has(key)) {
      errors.push(`${constName} targets missing catalog key ${key}`);
    }
  }
}

const sourceFiles = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (/\.(ts|tsx)$/.test(entry.name) && !file.includes("/i18n/locales/"))
      sourceFiles.push(file);
  }
}
collect(path.join(root, "apps/web/src"));
const used = new Set();
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bt\(["']([^"']+)["']/g))
    used.add(match[1]);
}
const unused = [...allKeys.keys()].filter(
  (key) =>
    !used.has(key) &&
    !key.startsWith("telegramPosts.status.") &&
    !key.startsWith("telegramPosts.errors.") &&
    !key.startsWith("telegram.posts.remoteStatus."),
);
if (unused.length)
  console.warn(
    `i18n:check warning: ${unused.length} keys have no direct t() usage (indirect typed mappings and test-only states may be valid).`,
  );

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `i18n:check passed: ${namespaces.length} namespaces, ${catalogFiles.length - namespaces.length} fragments, ${allKeys.size} canonical keys.`,
);
