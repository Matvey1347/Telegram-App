import axios, { type AxiosInstance } from "axios";

export function createHttpTransport({
  baseURL,
}: {
  baseURL: string | (() => string);
}): AxiosInstance {
  const client = axios.create({
    baseURL: typeof baseURL === "string" ? baseURL : undefined,
    withCredentials: true,
  });
  if (typeof baseURL === "function") {
    client.interceptors.request.use((config) => {
      config.baseURL = baseURL();
      return config;
    });
  }
  return client;
}

export function createRequestCorrelationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
