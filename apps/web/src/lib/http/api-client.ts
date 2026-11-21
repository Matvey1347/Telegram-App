import axios, { type AxiosRequestConfig } from "axios";
import type { StructuredApiError } from "@telegram-system/shared";
import { publicWebEnvironment } from "@/config/public-env";
import {
  clearAccessToken,
  getAccessToken,
  getAuthRedirectPath,
  rememberAuthReturnTo,
} from "../features/identity/auth";
import { resolveBrowserApiBase } from "./api-base";
import { productionActionHeaders } from "./production-confirmation";
import { createHttpTransport, createRequestCorrelationId } from "./transport";

export const apiBaseUrl = resolveBrowserApiBase(publicWebEnvironment.apiUrl);
export const api = createHttpTransport({ baseURL: apiBaseUrl });
let lastCorrelationId: string | null = null;
let freshReadRequestsInFlight = 0;
export function getLastCorrelationId() {
  return lastCorrelationId;
}
export async function withFreshApiReads<T>(run: () => Promise<T>): Promise<T> {
  freshReadRequestsInFlight += 1;
  try {
    return await run();
  } finally {
    freshReadRequestsInFlight = Math.max(0, freshReadRequestsInFlight - 1);
  }
}
export const API_MUTATION_EVENT = "telegram-system:api-mutation";
export type ApiFeedbackMode = "automatic" | "managed" | "silent";

export type ApiFeedbackConfig = {
  mode?: ApiFeedbackMode;
  operationId?: string;
  title?: string;
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  icon?: {
    emoji?: string | null;
    imageUrl?: string | null;
  };
};

export type StructuredApiErrorPayload = Partial<StructuredApiError> & {
  message?: string;
  code?: string;
  statusCode?: number;
  correlationId?: string;
};

export type ApiMutationEventDetail = {
  id: string;
  phase: "start" | "success" | "error";
  title?: string;
  message?: string;
  details?: string;
  code?: string;
  correlationId?: string;
  icon?: {
    emoji?: string | null;
    imageUrl?: string | null;
  };
  mode?: ApiFeedbackMode;
};

function emitMutationEvent(detail: ApiMutationEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ApiMutationEventDetail>(API_MUTATION_EVENT, { detail }),
  );
}

function isMutationMethod(method?: string) {
  return ["post", "put", "patch", "delete"].includes(
    String(method || "").toLowerCase(),
  );
}

function successMessage(method?: string) {
  if (String(method).toLowerCase() === "delete") return "Deleted successfully.";
  if (String(method).toLowerCase() === "post") return "Created successfully.";
  return "Saved successfully.";
}

function extractStructuredApiError(
  error: unknown,
): StructuredApiErrorPayload | null {
  if (!axios.isAxiosError(error) || !error.response?.data) {
    return null;
  }
  const payload = error.response.data as Partial<StructuredApiErrorPayload> & {
    message?: string | string[];
  };
  const message = Array.isArray(payload.message)
    ? payload.message.join("\n")
    : typeof payload.message === "string"
      ? payload.message
      : undefined;
  return {
    message: message || "Request failed.",
    details: payload.details ?? undefined,
    ...(typeof payload.code === "string" ? { code: payload.code } : {}),
    statusCode:
      typeof payload.statusCode === "number"
        ? payload.statusCode
        : error.response.status,
    ...(typeof payload.correlationId === "string"
      ? { correlationId: payload.correlationId }
      : {}),
  };
}

function defaultErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return "Something went wrong. Please try again.";
  }
  if (!error.response) {
    return "Could not connect to the server. Check your connection and try again.";
  }
  const raw = error.response.data?.message;
  const message = Array.isArray(raw)
    ? raw.join("\n")
    : String(raw || "").trim();
  if (
    !message ||
    /internal server error/i.test(message) ||
    /^error$/i.test(message)
  ) {
    return "The server could not complete this action. Please try again.";
  }
  return message;
}

function errorFeedback(error: unknown, fallback?: string) {
  const structured = extractStructuredApiError(error);
  const message =
    structured?.message?.trim() || fallback || defaultErrorMessage(error);
  const details =
    typeof structured?.details === "string" ? structured.details : undefined;
  const code =
    typeof structured?.code === "string" ? structured.code : undefined;
  const correlationId =
    typeof structured?.correlationId === "string"
      ? structured.correlationId
      : undefined;
  return { message, details, code, correlationId };
}
type FeedbackAwareConfig = AxiosRequestConfig & {
  feedback?: ApiFeedbackConfig;
};
export function withFeedback(config: FeedbackAwareConfig): FeedbackAwareConfig {
  return config;
}
export const silentFeedbackConfig = withFeedback({
  feedback: { mode: "silent" },
});

export function beginApiRequest() {
  const correlationId = createRequestCorrelationId();
  lastCorrelationId = correlationId;
  return correlationId;
}

export function isApiNetworkError(error: unknown) {
  return (
    axios.isAxiosError(error) &&
    !error.response &&
    (error.code === "ERR_NETWORK" ||
      error.code === "ERR_FAILED" ||
      error.code == null)
  );
}

api.interceptors.request.use(async (config) => {
  const correlationId = beginApiRequest();
  config.headers["X-Correlation-Id"] = correlationId;
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (typeof window !== "undefined") {
    const workspaceId = localStorage.getItem("selected-workspace-id");
    if (workspaceId) config.headers["X-Workspace-Id"] = workspaceId;
  }
  if (
    String(config.method || "get").toLowerCase() === "get" &&
    freshReadRequestsInFlight > 0
  ) {
    config.headers["X-Bypass-Response-Cache"] = "1";
    config.headers["Cache-Control"] = "no-cache";
    config.headers.Pragma = "no-cache";
  }
  if (isMutationMethod(config.method)) {
    const liveHeaders = new Headers();
    for (const name of ["Authorization", "X-Workspace-Id"]) {
      const value = config.headers.get(name);
      if (value) liveHeaders.set(name, String(value));
    }
    await productionActionHeaders(
      config.method!.toUpperCase(),
      api.getUri(config),
      liveHeaders,
      config.data,
      config.signal as AbortSignal | undefined,
    );
    for (const name of ["x-live-action-confirmation", "x-operator-revision"]) {
      const value = liveHeaders.get(name);
      if (value) config.headers.set(name, value);
    }
    const feedback = (config as FeedbackAwareConfig).feedback;
    const mode = feedback?.mode || "automatic";
    if (mode === "managed" || mode === "silent") {
      return config;
    }
    const requestId =
      feedback?.operationId ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    (
      config as typeof config & {
        mutationRequestId?: string;
        mutationFeedback?: ApiFeedbackConfig;
      }
    ).mutationRequestId = requestId;
    (
      config as typeof config & {
        mutationFeedback?: ApiFeedbackConfig;
      }
    ).mutationFeedback = feedback;
    emitMutationEvent({
      id: requestId,
      phase: "start",
      title: feedback?.title,
      message: feedback?.loadingMessage || "Waiting for the server…",
      icon: feedback?.icon,
      mode,
    });
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const requestId = (
      response.config as typeof response.config & {
        mutationRequestId?: string;
      }
    ).mutationRequestId;
    const feedback = (
      response.config as typeof response.config & {
        mutationFeedback?: ApiFeedbackConfig;
      }
    ).mutationFeedback;
    if (requestId) {
      emitMutationEvent({
        id: requestId,
        phase: "success",
        title: feedback?.title,
        message:
          feedback?.successMessage || successMessage(response.config.method),
        icon: feedback?.icon,
        mode: feedback?.mode || "automatic",
      });
    }
    return response;
  },
  (error) => {
    const requestId = (
      error?.config as { mutationRequestId?: string } | undefined
    )?.mutationRequestId;
    const feedback = (
      error?.config as { mutationFeedback?: ApiFeedbackConfig } | undefined
    )?.mutationFeedback;
    if (requestId) {
      const normalizedError = errorFeedback(error, feedback?.errorMessage);
      emitMutationEvent({
        id: requestId,
        phase: "error",
        title: feedback?.title,
        message: normalizedError.message,
        details: normalizedError.details,
        code: normalizedError.code,
        correlationId: normalizedError.correlationId,
        icon: feedback?.icon,
        mode: feedback?.mode || "automatic",
      });
    }
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      clearAccessToken();
      if (!["/login", "/register"].includes(window.location.pathname)) {
        rememberAuthReturnTo();
        window.location.href = getAuthRedirectPath();
      }
    }
    return Promise.reject(error);
  },
);
