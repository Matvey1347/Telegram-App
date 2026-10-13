import { installRailwayMemoryResponder } from "./railway-memory-diagnostics.mjs";

installRailwayMemoryResponder(process.env.RAILWAY_PROCESS_TYPE || "unknown");
