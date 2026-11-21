import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { parse } = require("dotenv");
const { Client } = require("pg");

function databaseFromFile(path) {
  try {
    return parse(readFileSync(path)).DATABASE_URL;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function requireLocalDatabase(environment = process.env, rootFile = ".env", apiFile = "apps/api/.env") {
  const input = environment.DATABASE_URL ?? databaseFromFile(rootFile) ?? databaseFromFile(apiFile);
  let url;
  try {
    url = new URL(input);
  } catch {
    // Report only the allowed target, never the input.
  }
  if (
    !url ||
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.port !== "5433" ||
    !/^\/[\w-]+$/u.test(url.pathname) ||
    url.hash ||
    [...url.searchParams].some(([key, value]) => key !== "schema" || value !== "public")
  ) {
    throw new Error("Local startup requires DATABASE_URL pointing to Docker PostgreSQL on localhost:5433. No processes were started.");
  }
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.href;
}

export async function useLocalDatabase(environment = process.env) {
  const databaseUrl = requireLocalDatabase(environment);
  requireLocalDockerBinding(databaseUrl, environment);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
  try {
    await client.connect();
  } catch {
    throw new Error("Could not open the configured local DATABASE_URL. Check that the database exists and its local credentials are correct. No processes were started.");
  } finally {
    await client.end();
  }
  environment.DATABASE_URL = databaseUrl;
}

// Check the published Compose binding without making a PostgreSQL connection.
export function requireLocalDockerBinding(databaseUrl, environment = process.env) {
  const failure = () => new Error(
    "Start this checkout's Docker Compose postgres service on local port 5433 before running the local API.",
  );
  const docker = (args) => {
    const result = spawnSync("docker", args, {
      env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8_000,
    });
    if (result.status !== 0) throw failure();
    return result.stdout.trim();
  };
  const localDaemon = /^(?:unix:\/\/\/|npipe:\/\/)/u;
  const endpoint = (!environment.DOCKER_CONTEXT && environment.DOCKER_HOST) ||
    docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
  if (!localDaemon.test(endpoint)) throw failure();
  const hostname = new URL(databaseUrl).hostname;
  const allowedBindings = hostname === "[::1]" ? ["[::1]:5433", "[::]:5433"] : ["127.0.0.1:5433", "0.0.0.0:5433"];
  const binding = docker(["compose", "-f", "docker-compose.yml", "port", "postgres", "5432"]);
  if (!binding.split(/\r?\n/u).some((line) => allowedBindings.includes(line.trim()))) throw failure();
}
