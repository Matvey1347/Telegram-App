import { fileURLToPath } from "node:url";

const entry = new URL("./db/verify-crm-migrations.mjs", import.meta.url);
process.argv[1] = fileURLToPath(entry);
await import(entry.href);
