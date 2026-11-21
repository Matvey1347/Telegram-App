"use client";

import { useForm } from "react-hook-form";
import { Button, FormField, Input, Modal } from "@/components/ui/primitives";

export function ImportChannelModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: string) => void;
  isSubmitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ input: string }>({ defaultValues: { input: "" } });
  return (
    <Modal open={open} onClose={onClose} title="Import">
      <form
        className="space-y-3"
        onSubmit={handleSubmit((values) => {
          onSubmit(values.input);
          reset({ input: "" });
        })}
      >
        <FormField
          label="Username, Telegram link, invite link or exact title"
          required
          error={errors.input ? "Required field" : undefined}
        >
          <Input
            placeholder="@channel, https://t.me/channel, https://t.me/+invite or Channel title"
            {...register("input", {
              required: true,
              validate: (value) =>
                String(value || "").trim().length > 0 || "Required field",
              maxLength: 300,
            })}
          />
        </FormField>
        <p className="text-xs leading-5 text-slate-400">
          Private invite links may join the channel using the connected Telegram
          account. Private channels cannot be found by title unless the account
          already has access.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Importing..." : "Import"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
