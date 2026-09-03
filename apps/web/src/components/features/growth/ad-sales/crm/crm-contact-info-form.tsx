"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { CrmContactDetail } from "@telegram-system/shared";
import type { UpdateCrmContactPayload } from "@/lib/features/growth/telegram-crm-api";
import { Button, FormField, Input, Textarea } from "@/components/ui/primitives";

type ContactInfoValues = {
  displayName: string;
  telegramUsername: string;
  phone: string;
  email: string;
  website: string;
  companyName: string;
  source: string;
  description: string;
};

function valuesFromContact(contact: CrmContactDetail): ContactInfoValues {
  return {
    displayName: contact.displayName,
    telegramUsername: contact.telegramUsername ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    website: contact.website ?? "",
    companyName: contact.companyName ?? "",
    source: contact.source ?? "",
    description: contact.description ?? "",
  };
}

export function CrmContactInfoForm({
  contact,
  canEdit,
  pending,
  error,
  onSave,
}: {
  contact: CrmContactDetail;
  canEdit: boolean;
  pending: boolean;
  error: boolean;
  onSave: (payload: UpdateCrmContactPayload) => void;
}) {
  const [values, setValues] = useState(() => valuesFromContact(contact));
  const field = (key: keyof ContactInfoValues) => ({
    value: values[key],
    disabled: !canEdit || pending,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((current) => ({ ...current, [key]: event.target.value })),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      displayName: values.displayName.trim(),
      telegramUsername: values.telegramUsername.trim() || null,
      phone: values.phone.trim() || null,
      email: values.email.trim() || null,
      website: values.website.trim() || null,
      companyName: values.companyName.trim() || null,
      source: values.source.trim() || null,
      description: values.description.trim() || null,
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name" required>
          <Input {...field("displayName")} aria-label="Name" required />
        </FormField>
        <FormField label="Telegram username">
          <Input
            {...field("telegramUsername")}
            aria-label="Telegram username"
            placeholder="username"
          />
        </FormField>
        <FormField label="Phone">
          <Input {...field("phone")} aria-label="Phone" />
        </FormField>
        <FormField label="Email">
          <Input {...field("email")} aria-label="Email" type="email" />
        </FormField>
        <FormField label="Website">
          <Input {...field("website")} aria-label="Website" />
        </FormField>
        <FormField label="Company">
          <Input {...field("companyName")} aria-label="Company" />
        </FormField>
        <FormField label="Source">
          <Input {...field("source")} aria-label="Source" />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Description">
            <Textarea
              {...field("description")}
              aria-label="Description"
              rows={4}
            />
          </FormField>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-rose-300">
          Contact changes could not be saved.
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          You do not have permission to edit this contact.
        </p>
      )}
    </form>
  );
}
