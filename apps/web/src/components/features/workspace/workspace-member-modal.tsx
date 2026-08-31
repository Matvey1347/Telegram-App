"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { WorkspaceRoleContract } from "@telegram-system/shared";
import type {
  TelegramUserAccount,
  WorkspaceMember,
  WorkspaceRole,
} from "@/lib/api";
import { IconPicker } from "@/components/icons/icon-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
  Modal,
} from "@/components/ui/primitives";

export type MemberFormValues = {
  email: string;
  name?: string;
  password?: string;
  roleDefinitionId: string;
  avatarIconId?: string | null;
  telegramUsername?: string | null;
  telegramUserAccountIds: string[];
};

export function WorkspaceMemberModal({
  open,
  mode,
  member,
  onClose,
  onSubmit,
  currentRole,
  telegramAccounts,
  accountOwnerById,
  roles,
  rolesLoading,
  rolesError,
}: {
  open: boolean;
  mode: "create" | "edit";
  member?: WorkspaceMember | null;
  onClose: () => void;
  onSubmit: (values: MemberFormValues) => void;
  currentRole: WorkspaceRole;
  telegramAccounts: TelegramUserAccount[];
  accountOwnerById: Map<string, WorkspaceMember>;
  roles: WorkspaceRoleContract[];
  rolesLoading: boolean;
  rolesError: boolean;
}) {
  const [identityMode, setIdentityMode] = useState<"username" | "account">(
    "username",
  );
  const allowedRoles = useMemo(
    () =>
      roles
        .filter((role) => currentRole === "owner" || role.systemKey !== "OWNER")
        .sort((left, right) =>
          left.systemKey === "OWNER"
            ? 1
            : right.systemKey === "OWNER"
              ? -1
              : left.name.localeCompare(right.name),
        ),
    [currentRole, roles],
  );
  const initialAssignedIds = useMemo(
    () =>
      member?.assignedTelegramUserAccounts?.map((account) => account.id) ?? [],
    [member],
  );
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MemberFormValues>({
    defaultValues: {
      email: "",
      name: "",
      password: "",
      roleDefinitionId: allowedRoles[0]?.id ?? "",
      avatarIconId: null,
      telegramUsername: "",
      telegramUserAccountIds: [],
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      email: mode === "create" ? "" : (member?.user.email ?? ""),
      name: mode === "create" ? "" : (member?.user.name ?? ""),
      password: "",
      roleDefinitionId:
        mode === "create"
          ? (allowedRoles[0]?.id ?? "")
          : (member?.roleDefinition?.id ??
            allowedRoles.find(
              (role) => member?.role === "owner" && role.systemKey === "OWNER",
            )?.id ??
            ""),
      avatarIconId: member?.avatarIconId ?? null,
      telegramUsername: member?.telegramUsername ?? "",
      telegramUserAccountIds: initialAssignedIds,
    });
    setIdentityMode(initialAssignedIds.length ? "account" : "username");
  }, [allowedRoles, initialAssignedIds, member, mode, open, reset]);

  const selectedAccountId = (watch("telegramUserAccountIds") ?? [])[0] ?? "";
  const availableTelegramAccounts = useMemo(
    () =>
      telegramAccounts.filter((account) => {
        const owner = accountOwnerById.get(account.id);
        return !owner || owner.id === member?.id;
      }),
    [accountOwnerById, member?.id, telegramAccounts],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === "create"
          ? "Add Member"
          : `Edit ${member?.user.name ?? "member"}`
      }
    >
      <form
        className="space-y-5"
        onSubmit={handleSubmit((values) => onSubmit(values))}
      >
        <FormField label="Avatar image">
          <IconPicker
            iconId={watch("avatarIconId") ?? null}
            icon={member?.avatarPresentation}
            onChange={(avatarIconId) =>
              setValue("avatarIconId", avatarIconId, { shouldDirty: true })
            }
            buttonLabel="Upload avatar"
          />
        </FormField>

        <section className="space-y-3">
          {mode === "create" ? (
            <>
              <FormField
                label="Email"
                required
                error={errors.email ? "Required field" : undefined}
              >
                <Input {...register("email", { required: true })} />
              </FormField>
              <FormField label="Name">
                <Input {...register("name")} />
              </FormField>
              <FormField label="Password (optional)">
                <Input type="password" {...register("password")} />
              </FormField>
            </>
          ) : null}
          <FormField label="Role" required>
            <CustomSelect
              value={watch("roleDefinitionId")}
              onChange={(roleDefinitionId) =>
                setValue("roleDefinitionId", roleDefinitionId, {
                  shouldDirty: true,
                })
              }
              disabled={rolesLoading || !allowedRoles.length}
              placeholder={rolesLoading ? "Loading roles…" : "Select role"}
              options={allowedRoles.map((role) => ({
                value: role.id,
                label: role.name,
                iconPresentation: role.iconPresentation ?? undefined,
                iconEmoji: role.emoji ?? undefined,
                iconFallback: role.name,
              }))}
            />
            {rolesError ? (
              <p className="mt-2 text-xs text-red-300">
                Roles could not be loaded. Close the modal and try again.
              </p>
            ) : !rolesLoading && !allowedRoles.length ? (
              <p className="mt-2 text-xs text-neutral-500">
                Create a role on the Roles &amp; access page first.
              </p>
            ) : null}
          </FormField>
        </section>

        <section
          className="space-y-3 border-t border-neutral-800 pt-4"
          aria-labelledby="telegram-identity-heading"
        >
          <div className="flex min-h-7 flex-wrap items-center gap-2">
            <p
              id="telegram-identity-heading"
              className="text-sm font-medium text-white"
            >
              Telegram identity
            </p>
            <SegmentedControl
              value={identityMode}
              ariaLabel="Telegram identity"
              onChange={(nextMode) => {
                setIdentityMode(nextMode);
                if (nextMode === "username") {
                  setValue("telegramUserAccountIds", [], { shouldDirty: true });
                } else {
                  setValue("telegramUsername", "", { shouldDirty: true });
                }
              }}
              options={[
                { value: "username", label: "Username" },
                { value: "account", label: "Connected account" },
              ]}
            />
          </div>
          {identityMode === "username" ? (
            <FormField label="Telegram username">
              <Input
                autoComplete="off"
                placeholder="@username"
                {...register("telegramUsername")}
              />
              <p className="mt-2 text-xs text-neutral-500">
                Used when no connected MTProto account is assigned.
              </p>
            </FormField>
          ) : (
            <FormField label="Telegram account">
              <CustomSelect
                value={selectedAccountId}
                onChange={(accountId) =>
                  setValue(
                    "telegramUserAccountIds",
                    accountId ? [accountId] : [],
                    { shouldDirty: true },
                  )
                }
                placeholder="Select connected account"
                disabled={!availableTelegramAccounts.length}
                options={availableTelegramAccounts.map((account) => {
                  const title =
                    [account.firstName, account.lastName]
                      .filter(Boolean)
                      .join(" ") || account.label;
                  return {
                    value: account.id,
                    label: title,
                    meta: account.username
                      ? `@${account.username.replace(/^@/, "")}`
                      : account.status,
                    iconUrl: account.photoUrl ?? undefined,
                    iconFallback: title,
                  };
                })}
              />
              {!availableTelegramAccounts.length ? (
                <p className="mt-2 text-xs text-neutral-500">
                  No available connected MTProto accounts.
                </p>
              ) : null}
            </FormField>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!watch("roleDefinitionId")}>
            {mode === "create" ? "Add" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
