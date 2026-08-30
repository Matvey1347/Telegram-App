"use client";

import { useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { authApi, isApiNetworkError } from "@/lib/api";
import { consumeAuthReturnTo, getAuthRedirectParam, setAccessToken } from "@/lib/features/identity/auth";
import { clearPersistedQueryCache } from "@/providers/query-provider";
import { Button, FormError, FormField, Input } from "@/components/ui/primitives";
import { AuthShell } from "./auth-shell";

function apiError(error: unknown, fallback: string) {
  if (isApiNetworkError(error)) return "Unable to connect to the server. Please try again later.";
  if (axios.isAxiosError(error)) { const message = error.response?.data?.message; if (Array.isArray(message)) return message.join(", "); if (typeof message === "string") return message; }
  return fallback;
}

export function LoginForm() {
  const router = useRouter(); const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string; password: string }>();
  const onSubmit = handleSubmit(async (values) => { setError(""); try { const result = await authApi.login(values.email, values.password); clearPersistedQueryCache(); setAccessToken(result.accessToken); router.replace(consumeAuthReturnTo(getAuthRedirectParam())); } catch (caught) { if (axios.isAxiosError(caught) && caught.response?.status === 401) setError("Invalid email or password"); else setError(apiError(caught, "Sign in failed. Please try again.")); } });
  return <AuthShell title="Welcome back" description="Sign in with your workspace account." footer={<>No account? <Link className="font-medium text-blue-300 hover:text-blue-200" href="/register">Create a workspace</Link></>}><form onSubmit={onSubmit} className="space-y-4" noValidate>
    <FormField label="Email" required error={errors.email?.message}><Input type="email" autoComplete="email" placeholder="you@company.com" {...register("email", { required: "Email is required" })} /></FormField>
    <FormField label="Password" required error={errors.password?.message}><Input type="password" autoComplete="current-password" placeholder="Enter your password" {...register("password", { required: "Password is required" })} /></FormField>
    <div className="flex justify-end"><Link href="/forgot-password" className="text-sm text-blue-300 hover:text-blue-200">Forgot password?</Link></div><FormError message={error} /><Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? "Signing in..." : "Sign in"}</Button>
  </form></AuthShell>;
}

export function RegisterForm() {
  const router = useRouter(); const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string; password: string; name: string; workspaceName?: string }>();
  const onSubmit = handleSubmit(async (values) => { setError(""); try { const result = await authApi.register(values); clearPersistedQueryCache(); setAccessToken(result.accessToken); router.replace(consumeAuthReturnTo(getAuthRedirectParam())); } catch (caught) { setError(apiError(caught, "Failed to create the workspace.")); } });
  return <AuthShell title="Create your workspace" description="Set up your account. You can invite the rest of your team later." footer={<>Already have an account? <Link className="font-medium text-blue-300 hover:text-blue-200" href="/login">Sign in</Link></>}><form onSubmit={onSubmit} className="space-y-4" noValidate>
    <FormField label="Your name" required error={errors.name?.message}><Input autoComplete="name" placeholder="Alex Morgan" {...register("name", { required: "Name is required" })} /></FormField>
    <FormField label="Work email" required error={errors.email?.message}><Input type="email" autoComplete="email" placeholder="you@company.com" {...register("email", { required: "Email is required" })} /></FormField>
    <FormField label="Password" required error={errors.password?.message}><Input type="password" autoComplete="new-password" placeholder="At least 8 characters" {...register("password", { required: "Password is required", minLength: { value: 8, message: "Use at least 8 characters" } })} /></FormField>
    <FormField label="Workspace name"><Input autoComplete="organization" placeholder="Company or team name" {...register("workspaceName")} /></FormField><FormError message={error} /><Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? "Creating..." : "Create workspace"}</Button>
  </form></AuthShell>;
}

export function ForgotPasswordForm() {
  const [error, setError] = useState(""); const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>();
  const onSubmit = handleSubmit(async ({ email }) => { setError(""); try { await authApi.forgotPassword(email); setSent(true); } catch (caught) { setError(apiError(caught, "We could not send the reset email.")); } });
  return <AuthShell title="Reset your password" description="Enter your account email and we’ll send you a secure reset link." footer={<Link className="font-medium text-blue-300 hover:text-blue-200" href="/login">Back to sign in</Link>}>{sent ? <div role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm leading-6 text-emerald-200">If an account exists for that email, a reset link is on its way.</div> : <form onSubmit={onSubmit} className="space-y-4" noValidate><FormField label="Email" required error={errors.email?.message}><Input type="email" autoComplete="email" placeholder="you@company.com" {...register("email", { required: "Email is required" })} /></FormField><FormError message={error} /><Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? "Sending..." : "Send reset link"}</Button></form>}</AuthShell>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState(""); const [complete, setComplete] = useState(false);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<{ password: string; confirmPassword: string }>();
  const onSubmit = handleSubmit(async ({ password }) => { if (!token) { setError("This reset link is missing a token. Request a new link."); return; } setError(""); try { await authApi.resetPassword(token, password); setComplete(true); } catch (caught) { setError(apiError(caught, "This reset link is invalid or has expired.")); } });
  return <AuthShell title="Choose a new password" description="Use a strong password you don’t use elsewhere." footer={<Link className="font-medium text-blue-300 hover:text-blue-200" href={complete ? "/login" : "/forgot-password"}>{complete ? "Continue to sign in" : "Request a new link"}</Link>}>{complete ? <div role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm text-emerald-200">Your password has been updated.</div> : <form onSubmit={onSubmit} className="space-y-4" noValidate>
    <FormField label="New password" required error={errors.password?.message}><Input type="password" autoComplete="new-password" placeholder="At least 8 characters" {...register("password", { required: "Password is required", minLength: { value: 8, message: "Use at least 8 characters" } })} /></FormField>
    <FormField label="Confirm password" required error={errors.confirmPassword?.message}><Input type="password" autoComplete="new-password" placeholder="Repeat your password" {...register("confirmPassword", { required: "Please confirm your password", validate: (value) => value === watch("password") || "Passwords do not match" })} /></FormField><FormError message={error} /><Button type="submit" disabled={isSubmitting || !token} className="w-full">{isSubmitting ? "Updating..." : "Update password"}</Button>
  </form>}</AuthShell>;
}
