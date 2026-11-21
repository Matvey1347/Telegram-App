"use client";

import { type PropsWithChildren, forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    passwordToggleLabels?: { show: string; hide: string };
  }
>(function Input({ className, type, passwordToggleLabels, ...props }, ref) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";
  const input = (
    <input
      {...props}
      ref={ref}
      type={isPassword && passwordVisible ? "text" : type}
      className={`min-h-9 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 focus:ring ${isPassword ? "pr-11" : ""} ${className ?? ""}`}
    />
  );

  if (!isPassword) return input;
  return (
    <span className="relative block">
      {input}
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setPasswordVisible((visible) => !visible)}
        className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50"
        aria-label={
          passwordVisible
            ? (passwordToggleLabels?.hide ?? "Hide password")
            : (passwordToggleLabels?.show ?? "Show password")
        }
        aria-pressed={passwordVisible}
      >
        {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  );
});

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 focus:ring ${props.className ?? ""}`}
    />
  );
}

export function FormField({
  label,
  required,
  error,
  children,
}: PropsWithChildren<{
  label: React.ReactNode;
  required?: boolean;
  error?: string;
}>) {
  return (
    <div className="block text-sm">
      <span className="mb-1 block text-neutral-300">
        {label}
        {required ? <span className="ml-1 text-red-400">*</span> : null}
      </span>
      {children}
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-sm text-red-400">{message}</p>;
}
