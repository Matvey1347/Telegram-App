import axios from "axios";
import { isDevelopmentHost } from "@/lib/app-brand";

const DEVELOPMENT_RESTART_RETRY_LIMIT = 30;
const DEVELOPMENT_RESTART_RETRY_DELAY_MS = 1_500;

function isNetworkFailure(error: unknown) {
  return axios.isAxiosError(error) && !error.response;
}

function isDevelopmentRuntime() {
  return (
    typeof window !== "undefined" && isDevelopmentHost(window.location.hostname)
  );
}

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
  development = isDevelopmentRuntime(),
) {
  if (development && isNetworkFailure(error)) {
    return failureCount < DEVELOPMENT_RESTART_RETRY_LIMIT;
  }
  return failureCount < 1;
}

export function queryRetryDelay(
  _attempt: number,
  error: unknown,
  development = isDevelopmentRuntime(),
) {
  if (development && isNetworkFailure(error)) {
    return DEVELOPMENT_RESTART_RETRY_DELAY_MS;
  }
  return 1_000;
}
