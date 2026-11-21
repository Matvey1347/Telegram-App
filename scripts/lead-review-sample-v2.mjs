import { fileURLToPath } from "node:url";

const entry = new URL("./qa/lead-review/lead-review-sample-v2.mjs", import.meta.url);
process.argv[1] = fileURLToPath(entry);
await import(entry.href);
