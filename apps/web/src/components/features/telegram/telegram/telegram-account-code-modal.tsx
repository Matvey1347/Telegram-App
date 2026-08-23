"use client";

import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { TelegramUserAccount } from "@/lib/api";
import { telegramUserAccountsApi } from "@/lib/api";
import { Button, FormField, Input, Modal } from "@/components/ui/primitives";

type ToastTone = "success" | "error" | "info" | "loading";

function errorMessage(error: unknown) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError.response?.data?.message || "Failed to confirm code.";
}

export function TelegramAccountCodeModal({
  open,
  account,
  onClose,
  onDone,
  onNeedPassword,
  onResend,
  onSendSms,
  showSmsFallback,
  isResending,
  pushToast,
}: {
  open: boolean;
  account: TelegramUserAccount | null;
  onClose: () => void;
  onDone: () => void;
  onNeedPassword: () => void;
  onResend: () => void;
  onSendSms: () => void;
  showSmsFallback: boolean;
  isResending: boolean;
  pushToast: (message: string, tone?: ToastTone) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ code: string }>();
  const mutation = useMutation({
    mutationFn: (code: string) =>
      telegramUserAccountsApi.confirmCode(String(account?.id), code),
    onSuccess: (response: { status?: string }) => {
      if (response.status === "needs_password") {
        onNeedPassword();
        return;
      }
      pushToast("Account connected.", "success");
      onDone();
    },
    onError: (error: unknown) => pushToast(errorMessage(error), "error"),
  });
  if (!account) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Enter code: ${account.label}`}>
      <form
        className="space-y-3"
        onSubmit={handleSubmit((values) => mutation.mutate(values.code))}
      >
        <FormField
          label="Code"
          required
          error={errors.code ? "Required field" : undefined}
        >
          <Input {...register("code", { required: true })} />
        </FormField>
        <p className="text-xs text-slate-400">
          Check the official Telegram service chat on an already authorized
          device. If no code arrived, request another one below.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            type="button"
            disabled={isResending}
            onClick={onResend}
          >
            {isResending ? "Sending…" : "Send code again"}
          </Button>
          {showSmsFallback ? (
            <Button
              variant="secondary"
              type="button"
              disabled={isResending}
              onClick={onSendSms}
            >
              Send via SMS
            </Button>
          ) : null}
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Confirming…" : "Confirm"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
