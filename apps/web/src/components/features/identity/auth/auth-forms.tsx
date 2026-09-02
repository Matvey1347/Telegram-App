"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type FieldError } from "react-hook-form";
import { authApi } from "@/lib/api";
import {
  consumeAuthReturnTo,
  getAuthRedirectParam,
  setAccessToken,
} from "@/lib/features/identity/auth";
import { localizedAuthError } from "@/lib/features/identity/auth-error";
import { clearPersistedQueryCache } from "@/providers/query-provider";
import { APP_LOCALE_COOKIE, normalizeAppLocale } from "@/i18n/types";
import type { TranslationKey } from "@/i18n/catalog";
import { useI18n } from "@/providers/i18n-provider";
import {
  Button,
  FormError,
  FormField,
  Input,
} from "@/components/ui/primitives";
import { AuthShell } from "./auth-shell";

function persistAuthenticatedLocale(locale: unknown) {
  const normalized = normalizeAppLocale(
    typeof locale === "string" ? locale : undefined,
  );
  document.cookie = `${APP_LOCALE_COOKIE}=${normalized}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.lang = normalized;
}

function translatedFieldError(
  error: FieldError | undefined,
  t: ReturnType<typeof useI18n>["t"],
) {
  return error?.message ? t(error.message as TranslationKey) : undefined;
}

export function LoginForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string; password: string }>();
  const onSubmit = handleSubmit(async (values) => {
    setError("");
    try {
      const result = await authApi.login(values.email, values.password);
      clearPersistedQueryCache();
      setAccessToken(result.accessToken);
      persistAuthenticatedLocale(result.user.locale);
      router.replace(consumeAuthReturnTo(getAuthRedirectParam()));
    } catch (caught) {
      setError(localizedAuthError(caught, t, "auth.errors.signIn"));
    }
  });
  return (
    <AuthShell
      title={t("auth.login.title")}
      description={t("auth.login.description")}
      footer={
        <>
          {t("auth.login.noAccount")}{" "}
          <Link
            className="font-medium text-blue-300 hover:text-blue-200"
            href="/register"
          >
            {t("auth.login.createWorkspace")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField
          label={t("auth.fields.email")}
          required
          error={translatedFieldError(errors.email, t)}
        >
          <Input
            aria-label={t("auth.fields.email")}
            type="email"
            autoComplete="email"
            placeholder={t("auth.placeholders.email")}
            {...register("email", {
              required: "auth.validation.emailRequired",
            })}
          />
        </FormField>
        <FormField
          label={t("auth.fields.password")}
          required
          error={translatedFieldError(errors.password, t)}
        >
          <Input
            aria-label={t("auth.fields.password")}
            passwordToggleLabels={{
              show: t("auth.password.show"),
              hide: t("auth.password.hide"),
            }}
            type="password"
            autoComplete="current-password"
            placeholder={t("auth.placeholders.password")}
            {...register("password", {
              required: "auth.validation.passwordRequired",
            })}
          />
        </FormField>
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-blue-300 hover:text-blue-200"
          >
            {t("auth.login.forgotPassword")}
          </Link>
        </div>
        <FormError message={error} />
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{
    email: string;
    password: string;
    name: string;
    workspaceName?: string;
  }>();
  const onSubmit = handleSubmit(async (values) => {
    setError("");
    try {
      const result = await authApi.register({ ...values, locale });
      clearPersistedQueryCache();
      setAccessToken(result.accessToken);
      persistAuthenticatedLocale(result.user.locale);
      router.replace(consumeAuthReturnTo(getAuthRedirectParam()));
    } catch (caught) {
      setError(localizedAuthError(caught, t, "auth.errors.register"));
    }
  });
  return (
    <AuthShell
      title={t("auth.register.title")}
      description={t("auth.register.description")}
      footer={
        <>
          {t("auth.register.hasAccount")}{" "}
          <Link
            className="font-medium text-blue-300 hover:text-blue-200"
            href="/login"
          >
            {t("auth.register.signIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField
          label={t("auth.fields.name")}
          required
          error={translatedFieldError(errors.name, t)}
        >
          <Input
            aria-label={t("auth.fields.name")}
            autoComplete="name"
            placeholder={t("auth.placeholders.name")}
            {...register("name", { required: "auth.validation.nameRequired" })}
          />
        </FormField>
        <FormField
          label={t("auth.fields.workEmail")}
          required
          error={translatedFieldError(errors.email, t)}
        >
          <Input
            aria-label={t("auth.fields.workEmail")}
            type="email"
            autoComplete="email"
            placeholder={t("auth.placeholders.email")}
            {...register("email", {
              required: "auth.validation.emailRequired",
            })}
          />
        </FormField>
        <FormField
          label={t("auth.fields.password")}
          required
          error={translatedFieldError(errors.password, t)}
        >
          <Input
            aria-label={t("auth.fields.password")}
            passwordToggleLabels={{
              show: t("auth.password.show"),
              hide: t("auth.password.hide"),
            }}
            type="password"
            autoComplete="new-password"
            placeholder={t("auth.placeholders.newPassword")}
            {...register("password", {
              required: "auth.validation.passwordRequired",
              minLength: { value: 8, message: "auth.validation.passwordMin" },
            })}
          />
        </FormField>
        <FormField label={t("auth.fields.workspaceName")}>
          <Input
            aria-label={t("auth.fields.workspaceName")}
            autoComplete="organization"
            placeholder={t("auth.placeholders.workspaceName")}
            {...register("workspaceName")}
          />
        </FormField>
        <FormError message={error} />
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting
            ? t("auth.register.submitting")
            : t("auth.register.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>();
  const onSubmit = handleSubmit(async ({ email }) => {
    setError("");
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (caught) {
      setError(localizedAuthError(caught, t, "auth.errors.forgot"));
    }
  });
  return (
    <AuthShell
      title={t("auth.forgot.title")}
      description={t("auth.forgot.description")}
      footer={
        <Link
          className="font-medium text-blue-300 hover:text-blue-200"
          href="/login"
        >
          {t("auth.forgot.back")}
        </Link>
      }
    >
      {sent ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm leading-6 text-emerald-200"
        >
          {t("auth.forgot.sent")}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            label={t("auth.fields.email")}
            required
            error={translatedFieldError(errors.email, t)}
          >
            <Input
              aria-label={t("auth.fields.email")}
              type="email"
              autoComplete="email"
              placeholder={t("auth.placeholders.email")}
              {...register("email", {
                required: "auth.validation.emailRequired",
              })}
            />
          </FormField>
          <FormError message={error} />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting
              ? t("auth.forgot.submitting")
              : t("auth.forgot.submit")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ password: string; confirmPassword: string }>();
  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) {
      setError(t("auth.errors.resetTokenMissing"));
      return;
    }
    setError("");
    try {
      await authApi.resetPassword(token, password);
      setComplete(true);
    } catch (caught) {
      setError(localizedAuthError(caught, t, "auth.errors.resetTokenInvalid"));
    }
  });
  return (
    <AuthShell
      title={t("auth.reset.title")}
      description={t("auth.reset.description")}
      footer={
        <Link
          className="font-medium text-blue-300 hover:text-blue-200"
          href={complete ? "/login" : "/forgot-password"}
        >
          {complete ? t("auth.reset.continue") : t("auth.reset.requestNew")}
        </Link>
      }
    >
      {complete ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm text-emerald-200"
        >
          {t("auth.reset.complete")}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            label={t("auth.fields.newPassword")}
            required
            error={translatedFieldError(errors.password, t)}
          >
            <Input
              aria-label={t("auth.fields.newPassword")}
              passwordToggleLabels={{
                show: t("auth.password.show"),
                hide: t("auth.password.hide"),
              }}
              type="password"
              autoComplete="new-password"
              placeholder={t("auth.placeholders.newPassword")}
              {...register("password", {
                required: "auth.validation.passwordRequired",
                minLength: { value: 8, message: "auth.validation.passwordMin" },
              })}
            />
          </FormField>
          <FormField
            label={t("auth.fields.confirmPassword")}
            required
            error={translatedFieldError(errors.confirmPassword, t)}
          >
            <Input
              aria-label={t("auth.fields.confirmPassword")}
              passwordToggleLabels={{
                show: t("auth.password.show"),
                hide: t("auth.password.hide"),
              }}
              type="password"
              autoComplete="new-password"
              placeholder={t("auth.placeholders.confirmPassword")}
              {...register("confirmPassword", {
                required: "auth.validation.confirmRequired",
                validate: (value, values) =>
                  value === values.password ||
                  "auth.validation.passwordMismatch",
              })}
            />
          </FormField>
          <FormError message={error} />
          <Button
            type="submit"
            disabled={isSubmitting || !token}
            className="w-full"
          >
            {isSubmitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
