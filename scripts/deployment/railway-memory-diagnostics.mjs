const BYTES_PER_MEGABYTE = 1024 * 1024;

export const RAILWAY_MEMORY_SAMPLE_REQUEST = "railway_memory_sample";
export const RAILWAY_MEMORY_SAMPLE_RESPONSE = "railway_memory_sample_result";
export const RAILWAY_MEMORY_SAMPLE_INTERVAL_MS = 5 * 60_000;

function toMb(bytes) {
  return Math.round((bytes / BYTES_PER_MEGABYTE) * 10) / 10;
}

export function takeRailwayMemorySnapshot(processType, runtime = process) {
  const memory = runtime.memoryUsage();
  return {
    timestamp: new Date().toISOString(),
    processType,
    pid: runtime.pid,
    uptimeSeconds: Math.round(runtime.uptime()),
    rssMb: toMb(memory.rss),
    heapUsedMb: toMb(memory.heapUsed),
    heapTotalMb: toMb(memory.heapTotal),
    externalMb: toMb(memory.external),
    arrayBuffersMb: toMb(memory.arrayBuffers),
  };
}

export function installRailwayMemoryResponder(processType, runtime = process) {
  const onMessage = (message) => {
    if (
      message?.type !== RAILWAY_MEMORY_SAMPLE_REQUEST ||
      typeof runtime.send !== "function"
    ) {
      return;
    }
    runtime.send({
      type: RAILWAY_MEMORY_SAMPLE_RESPONSE,
      requestId: message.requestId,
      sample: takeRailwayMemorySnapshot(processType, runtime),
    });
  };
  runtime.on("message", onMessage);
  return () => runtime.off("message", onMessage);
}
