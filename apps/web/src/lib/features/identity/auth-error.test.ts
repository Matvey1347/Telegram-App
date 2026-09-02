import axios from "axios";
import { describe, expect, it } from "vitest";
import authRu from "@/i18n/locales/ru/auth";
import type { TranslationKey } from "@/i18n/catalog";
import { localizedAuthError } from "./auth-error";

const t = (key: TranslationKey) => authRu[key as keyof typeof authRu] ?? key;

describe("localizedAuthError", () => {
  it("translates a structured backend auth code without exposing English text", () => {
    const error = new axios.AxiosError("request failed", "ERR_BAD_REQUEST", undefined, undefined, {
      data: { code: "AUTH_EMAIL_ALREADY_EXISTS", message: "Email already exists" },
      status: 409,
      statusText: "Conflict",
      headers: {},
      config: { headers: {} as never },
    });

    expect(localizedAuthError(error, t, "auth.errors.generic")).toBe("Аккаунт с таким email уже существует.");
  });
});
