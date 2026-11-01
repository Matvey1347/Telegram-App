"use client";
import { useState } from "react";
import {
  normalizeInstagramProfile,
  type CrmInstagramMethod,
  type CrmInstagramMethodInput,
} from "@telegram-system/shared";
import { Button, Input, FormField } from "@/components/ui/primitives";
export function InstagramMethodEditor({
  method,
  pending,
  onSave,
}: {
  method?: CrmInstagramMethod;
  pending: boolean;
  onSave: (input: CrmInstagramMethodInput) => Promise<void>;
}) {
  const [value, setValue] = useState(method?.value ?? "");
  const [confirmed, setConfirmed] = useState(false);
  let valid = false;
  try {
    normalizeInstagramProfile(value);
    valid = true;
  } catch {
    /* Explicit invalid input state. */
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid)
          void onSave({
            value,
            ownershipConfirmed: confirmed,
            state: "ACTIVE",
            isPrimary: method?.isPrimary ?? true,
          }).catch(() => {});
      }}
    >
      <FormField label="Instagram username / profile">
        <Input
          aria-label="Instagram username / profile"
          value={value}
          maxLength={500}
          onChange={(e) => {
            setValue(e.target.value);
            setConfirmed(false);
          }}
          placeholder="@business_name"
        />
      </FormField>
      {value && !valid ? (
        <p role="alert" className="text-xs text-amber-200">
          Use a username or an HTTPS instagram.com profile URL.
        </p>
      ) : null}
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I confirm this profile belongs to this advertiser. Profile existence
          remains unverified.
        </span>
      </label>
      {method ? (
        <p className="text-xs text-neutral-400">
          Changing the username clears previous ownership confirmation. Review
          and confirm the new identity explicitly.
        </p>
      ) : null}
      <Button disabled={pending || !valid} type="submit">
        {method ? "Save reviewed profile" : "Add Instagram profile"}
      </Button>
    </form>
  );
}
