"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { MemberSelect } from "@/components/features/workspace/member-select";
import {
  type TelegramChannel,
  type TelegramChannelAdAnalysis,
  type TelegramChannelAdAnalysisPayload,
} from "@/lib/api";
import {
  Button,
  CurrencySelect,
  DateInput,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { formatLocalDate } from "./telegram-channels-workspace-utils";

export type AdAnalysisFormValues = {
  price?: number;
  currency?: string;
  analyzedAt: string;
  status: "APPROVED" | "REJECTED";
  notes?: string;
  assignedMemberId?: string | null;
};
export function AdAnalysisModal({
  open,
  channel,
  analysis,
  currencies,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  channel?: TelegramChannel;
  analysis?: TelegramChannelAdAnalysis;
  currencies: string[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: TelegramChannelAdAnalysisPayload) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AdAnalysisFormValues>();
  useEffect(() => {
    if (!open) return;
    const existingStatus =
      analysis?.status === "REJECTED" ? "REJECTED" : "APPROVED";
    reset({
      price: analysis?.price == null ? undefined : Number(analysis.price),
      currency: analysis?.currency || "",
      analyzedAt: analysis?.analyzedAt
        ? formatLocalDate(analysis.analyzedAt)
        : formatLocalDate(new Date()),
      status: existingStatus,
      notes: analysis?.notes || "",
      assignedMemberId: analysis?.assignedMemberId,
    });
  }, [analysis, open, reset]);
  const currencyOptions = Array.from(
    new Set([analysis?.currency, ...currencies].filter(Boolean) as string[]),
  ).sort();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${analysis ? "Edit analysis" : "Analyze"} ${channel?.title || "channel"}`}
      allowOverflow
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit((values) =>
          onSubmit({
            ...values,
            price:
              values.price == null || Number.isNaN(values.price)
                ? undefined
                : values.price,
            currency: values.currency?.toUpperCase() || undefined,
            postLimit: 20,
          }),
        )}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Price">
            <Input
              type="number"
              min="0"
              step="0.01"
              {...register("price", { valueAsNumber: true })}
            />
          </FormField>
          <FormField label="Currency">
            <CurrencySelect
              value={watch("currency") || ""}
              currencies={currencyOptions}
              onChange={(value) =>
                setValue("currency", value, { shouldDirty: true })
              }
            />
          </FormField>
          <FormField label="Status">
            <Select {...register("status")}>
              <option value="APPROVED" className="text-emerald-300">
                Approved
              </option>
              <option value="REJECTED" className="text-rose-300">
                Rejected
              </option>
            </Select>
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Date"
            required
            error={errors.analyzedAt ? "Date is required" : undefined}
          >
            <Controller
              name="analyzedAt"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <DateInput
                  name={field.name}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  placeholder="Select date"
                />
              )}
            />
          </FormField>
          <FormField label="Member">
            <MemberSelect
              value={watch("assignedMemberId")}
              onChange={(assignedMemberId) =>
                setValue("assignedMemberId", assignedMemberId || null)
              }
              defaultToCurrent={!analysis}
            />
          </FormField>
        </div>
        <FormField label="Notes">
          <Textarea rows={3} {...register("notes")} />
        </FormField>
        <p className="text-xs text-slate-500">
          Average views, reactions, forwards and CPM are calculated from the
          latest 20 Telegram posts.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save analysis"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
