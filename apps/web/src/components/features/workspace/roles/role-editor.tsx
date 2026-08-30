"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  FeatureDefinition,
  WorkspaceRoleContract,
  WorkspaceRoleMode,
} from "@telegram-system/shared";
import {
  Button,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import { IconPicker } from "@/components/icons/icon-picker";
import type { WorkspaceRoleInput } from "@/lib/features/workspace/workspace-roles-api";
import {
  capabilityLabel,
  featureCopy,
  permissionIsEnabled,
  summarizeRole,
} from "./role-copy";

type Props = {
  open: boolean;
  role?: WorkspaceRoleContract | null;
  features: readonly FeatureDefinition[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: WorkspaceRoleInput) => void;
};

const LEVELS = [
  { id: "none", label: "No access", capabilities: [] },
  { id: "view", label: "View", capabilities: ["view"] },
  {
    id: "own",
    label: "Own data",
    capabilities: ["view", "create", "editOwn", "deleteOwn"],
  },
  {
    id: "manage",
    label: "Full access",
    capabilities: [
      "view",
      "create",
      "editOwn",
      "editAny",
      "deleteOwn",
      "deleteAny",
      "manage",
    ],
  },
] as const;

export function RoleEditor({
  open,
  role,
  features,
  saving,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const [iconId, setIconId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<WorkspaceRoleMode>("ALLOWLIST");
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [advanced, setAdvanced] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setIconId(role?.iconId ?? null);
    setDescription(role?.description ?? "");
    setMode(role?.mode ?? "ALLOWLIST");
    setKeys(new Set(role?.permissionKeys ?? []));
    setAdvanced(null);
  }, [open, role]);

  const enabled = (id: string) => permissionIsEnabled(mode, keys, id);
  const setPermission = (id: string, value: boolean) =>
    setKeys((current) => {
      const next = new Set(current);
      const storeKey = mode === "ALLOWLIST" ? value : !value;
      if (storeKey) next.add(id);
      else next.delete(id);
      return next;
    });
  const setLevel = (
    feature: FeatureDefinition,
    capabilities: readonly string[],
  ) => {
    const standard = feature.permissions.filter(
      (item) => item.sensitivity === "standard",
    );
    setKeys((current) => {
      const next = new Set(current);
      for (const permission of standard) {
        const value = capabilities.includes(permission.capability);
        const storeKey = mode === "ALLOWLIST" ? value : !value;
        if (storeKey) next.add(permission.id);
        else next.delete(permission.id);
      }
      return next;
    });
  };
  const changeMode = (nextMode: WorkspaceRoleMode) => {
    if (nextMode === mode) return;
    const inverted = new Set(
      features
        .flatMap((f) => f.permissions)
        .filter((p) => !keys.has(p.id))
        .map((p) => p.id),
    );
    setKeys(inverted);
    setMode(nextMode);
  };
  const summary = useMemo(
    () => summarizeRole(features, mode, keys),
    [features, keys, mode],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role ? `Edit ${role.name}` : "Create role"}
      size="xl"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            name: name.trim(),
            iconId,
            description: description.trim(),
            mode,
            permissionKeys: [...keys],
            version: role?.version,
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[72px_1fr]">
          <FormField label="Icon">
            <IconPicker
              compact
              iconId={iconId}
              icon={role?.iconPresentation}
              onChange={setIconId}
              buttonLabel="Choose role icon"
              className="!h-10 !w-10"
            />
          </FormField>
          <FormField label="Role name" required>
            <Input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="What is this role for?">
          <Textarea
            value={description}
            maxLength={300}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>

        <fieldset className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
          <legend className="px-1 text-sm font-medium text-white">
            Permission strategy
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["ALLOWLIST", "DENYLIST"] as const).map((value) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border p-3 ${mode === value ? "border-blue-600 bg-blue-950/30" : "border-neutral-800"}`}
              >
                <input
                  className="mr-2"
                  type="radio"
                  checked={mode === value}
                  onChange={() => changeMode(value)}
                />
                <span className="text-sm font-medium">
                  {value === "ALLOWLIST"
                    ? "Only selected access"
                    : "Broad role with exceptions"}
                </span>
                <span className="mt-1 block text-xs text-neutral-400">
                  {value === "ALLOWLIST"
                    ? "Starts closed and grants selected capabilities."
                    : "Starts open and stores only denied capabilities."}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-3">
          {features.map((feature) => {
            const copy = featureCopy(feature);
            const standard = feature.permissions.filter(
              (item) => item.sensitivity === "standard",
            );
            const sensitive = feature.permissions.filter(
              (item) => item.sensitivity !== "standard",
            );
            const current =
              LEVELS.findLast((level) =>
                level.capabilities.every((capability) => {
                  const permission = standard.find(
                    (item) => item.capability === capability,
                  );
                  return !permission || enabled(permission.id);
                }),
              )?.id ?? "none";
            return (
              <section
                key={feature.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-white">{copy.label}</h3>
                    <p className="text-xs text-neutral-400">
                      {copy.description}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-1 sm:flex">
                    {LEVELS.map((level) => (
                      <button
                        key={level.id}
                        type="button"
                        onClick={() => setLevel(feature, level.capabilities)}
                        className={`rounded-lg px-3 py-2 text-xs ${current === level.id ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>
                {sensitive.length ? (
                  <div className="mt-3 border-t border-neutral-800 pt-3">
                    <button
                      type="button"
                      className="text-xs text-blue-300"
                      onClick={() =>
                        setAdvanced(advanced === feature.id ? null : feature.id)
                      }
                    >
                      {advanced === feature.id ? "Hide" : "Advanced"} sensitive
                      actions
                    </button>
                    {advanced === feature.id ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {sensitive.map((permission) => (
                          <label
                            key={permission.id}
                            className="flex items-start gap-2 rounded-lg bg-neutral-950/60 p-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={enabled(permission.id)}
                              onChange={(e) =>
                                setPermission(permission.id, e.target.checked)
                              }
                            />
                            <span>
                              <span className="block text-neutral-200">
                                {capabilityLabel(permission.capability)}
                              </span>
                              <span className="text-xs text-amber-300">
                                {permission.sensitivity}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        <div className="rounded-xl border border-blue-900/70 bg-blue-950/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-300">
            Access overview
          </p>
          <p className="mt-2 text-sm text-neutral-200">{summary}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save role"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
