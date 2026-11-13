import { existsSync, readFileSync } from "node:fs";

/** Identify the database used by the local compatibility API, without exposing its URL. */
export function localDatabaseEnvironment(environment = process.env, envFile = ".env") {
  let databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl && existsSync(envFile)) {
    const contents = readFileSync(envFile, "utf8");
    const match = contents.match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s#]+))/mu);
    databaseUrl = match?.[1] ?? match?.[2] ?? match?.[3];
  }
  if (!databaseUrl) return "";
  try {
    const host = new URL(databaseUrl).hostname.toLowerCase();
    return host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || host === "host.docker.internal" || /^127(?:\.\d{1,3}){3}$/u.test(host) ? "local" : "";
  } catch {
    return "";
  }
}
