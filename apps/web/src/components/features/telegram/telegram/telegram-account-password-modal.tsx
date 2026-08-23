"use client";

import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { TelegramUserAccount } from "@/lib/api";
import { telegramUserAccountsApi } from "@/lib/api";
import { Button, FormField, Input, Modal } from "@/components/ui/primitives";

type ToastTone = "success" | "error" | "info" | "loading";

function errorMessage(error: unknown) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError.response?.data?.message || "Failed to confirm password.";
}

export function TelegramAccountPasswordModal({
  open,
  account,
  onClose,
  onDone,
  pushToast,
}: {
  open: boolean;
  account: TelegramUserAccount | null;
  onClose: () => void;
  onDone: () => void;
  pushToast: (message: string, tone?: ToastTone) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ password: string }>();
  const mutation = useMutation({
    mutationFn: (password: string) =>
      telegramUserAccountsApi.confirmPassword(String(account?.id), password),
    onSuccess: () => {
      pushToast("Account connected.", "success");
      onDone();
    },
    onError: (error: unknown) => pushToast(errorMessage(error), "error"),
  });
  if (!account) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`2FA password: ${account.label}`}
    >
      <form
        className="space-y-3"
        onSubmit={handleSubmit((values) => mutation.mutate(values.password))}
      >
        <FormField
          label="Password"
          required
          error={errors.password ? "Required field" : undefined}
        >
          <Input
            type="password"
            {...register("password", { required: true })}
          />
        </FormField>
        <div className="flex justify-end gap-2">
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
