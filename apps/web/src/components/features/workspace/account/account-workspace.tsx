"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Send, UserRound } from "lucide-react";
import { IconPicker } from "@/components/icons/icon-picker";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Card,
  CustomSelect,
  FormError,
  FormField,
  Input,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import {
  accountApi,
  telegramUserAccountsApi,
  type TelegramUserAccount,
} from "@/lib/api";
import {
  accountKeys,
  authKeys,
  memberKeys,
  telegramAccountKeys,
} from "@/lib/query-keys";

type AccountTab = "profile" | "password";
type IdentityMode = "username" | "account";
type ProfileValues = {
  name: string;
  email: string;
  telegramUsername: string;
  telegramUserAccountIds: string[];
};
type PasswordValues = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

const messageOf = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  return typeof message === "string" ? message : fallback;
};
const accountTitle = (account: TelegramUserAccount) =>
  [account.firstName, account.lastName].filter(Boolean).join(" ") ||
  account.label;

export function AccountWorkspace() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AccountTab>("profile");
  const [identityMode, setIdentityMode] = useState<IdentityMode>("username");
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [avatarIconId, setAvatarIconId] = useState<string | null>(null);
  const account = useQuery({
    queryKey: accountKeys.me(),
    queryFn: accountApi.me,
  });
  const telegramAccounts = useQuery({
    queryKey: telegramAccountKeys.accounts(),
    queryFn: telegramUserAccountsApi.list,
  });
  const profileForm = useForm<ProfileValues>({
    values: {
      name: account.data?.name ?? "",
      email: account.data?.email ?? "",
      telegramUsername: account.data?.telegramUsername ?? "",
      telegramUserAccountIds:
        account.data?.assignedTelegramUserAccounts?.map(({ id }) => id) ?? [],
    },
  });
  const passwordForm = useForm<PasswordValues>();

  useEffect(() => {
    if (!account.data) return;
    // Async account data hydrates controls outside react-hook-form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvatarIconId(
      account.data.avatarIconId ?? account.data.avatarIcon?.id ?? null,
    );
    setIdentityMode(
      account.data.assignedTelegramUserAccounts?.length
        ? "account"
        : "username",
    );
  }, [account.data]);

  const assignedIds =
    account.data?.assignedTelegramUserAccounts?.map(({ id }) => id) ?? [];
  const availableAccounts = useMemo(
    () =>
      (telegramAccounts.data ?? []).filter(
        (item) => !item.assignedMember || assignedIds.includes(item.id),
      ),
    [assignedIds, telegramAccounts.data],
  );
  const selectedAccountId =
    profileForm.watch("telegramUserAccountIds")?.[0] ?? "";
  const selectedAccount = availableAccounts.find(
    ({ id }) => id === selectedAccountId,
  );

  const updateProfile = useMutation({
    mutationFn: accountApi.updateMe,
    onSuccess: (updated) => {
      setProfileError("");
      queryClient.setQueryData(accountKeys.me(), updated);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: authKeys.me() }),
        queryClient.invalidateQueries({ queryKey: memberKeys.members() }),
        queryClient.invalidateQueries({
          queryKey: telegramAccountKeys.accounts(),
        }),
      ]);
    },
    onError: (error: unknown) =>
      setProfileError(messageOf(error, "Failed to update profile")),
  });
  const updatePassword = useMutation({
    mutationFn: accountApi.updatePassword,
    onSuccess: () => {
      setPasswordError("");
      passwordForm.reset();
    },
    onError: (error: unknown) =>
      setPasswordError(messageOf(error, "Failed to update password")),
  });

  return (
    <AppShell>
      <PageHeader
        title="My Profile"
        subtitle="Personal details, Telegram identity and security"
      />
      <div
        className="mb-4 inline-flex w-full rounded-xl border border-neutral-800 bg-neutral-900/60 p-1 sm:w-auto"
        role="tablist"
        aria-label="Profile sections"
      >
        <Tab
          active={tab === "profile"}
          onClick={() => setTab("profile")}
          icon={<UserRound size={16} />}
          label="Profile settings"
        />
        <Tab
          active={tab === "password"}
          onClick={() => setTab("password")}
          icon={<KeyRound size={16} />}
          label="Change password"
        />
      </div>
      {account.isLoading || !account.data ? (
        <LoadingState />
      ) : tab === "profile" ? (
        <ProfileForm
          data={account.data}
          form={profileForm}
          avatarIconId={avatarIconId}
          setAvatarIconId={setAvatarIconId}
          identityMode={identityMode}
          setIdentityMode={setIdentityMode}
          accounts={availableAccounts}
          accountsLoading={telegramAccounts.isLoading}
          selectedAccount={selectedAccount}
          selectedAccountId={selectedAccountId}
          error={profileError}
          pending={updateProfile.isPending}
          onSubmit={(values) =>
            updateProfile.mutate({
              name: values.name,
              email: values.email,
              avatarIconId,
              telegramUsername:
                identityMode === "username"
                  ? values.telegramUsername.trim() || null
                  : null,
              telegramUserAccountIds:
                identityMode === "account" && selectedAccountId
                  ? [selectedAccountId]
                  : [],
            })
          }
        />
      ) : (
        <PasswordForm
          form={passwordForm}
          error={passwordError}
          pending={updatePassword.isPending}
          onSubmit={(values) => {
            if (values.newPassword !== values.confirmNewPassword)
              return setPasswordError(
                "New password confirmation does not match",
              );
            updatePassword.mutate({
              currentPassword: values.currentPassword,
              newPassword: values.newPassword,
            });
          }}
        />
      )}
    </AppShell>
  );
}

function ProfileForm({
  data,
  form,
  avatarIconId,
  setAvatarIconId,
  identityMode,
  setIdentityMode,
  accounts,
  accountsLoading,
  selectedAccount,
  selectedAccountId,
  error,
  pending,
  onSubmit,
}: {
  data: Awaited<ReturnType<typeof accountApi.me>>;
  form: ReturnType<typeof useForm<ProfileValues>>;
  avatarIconId: string | null;
  setAvatarIconId: (id: string | null) => void;
  identityMode: IdentityMode;
  setIdentityMode: (mode: IdentityMode) => void;
  accounts: TelegramUserAccount[];
  accountsLoading: boolean;
  selectedAccount?: TelegramUserAccount;
  selectedAccountId: string;
  error: string;
  pending: boolean;
  onSubmit: (values: ProfileValues) => void;
}) {
  return (
    <Card className="max-w-3xl">
      <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
          <IconPicker
            compact
            iconId={avatarIconId}
            icon={data.avatarPresentation}
            onChange={setAvatarIconId}
            buttonLabel="Change avatar"
            className="!h-14 !w-14 !overflow-hidden !rounded-xl !border-neutral-700 !bg-neutral-950 text-xl"
            iconClassName="!h-full !w-full !rounded-xl !border-0 !bg-transparent"
          />
          <div>
            <p className="font-medium text-white">Profile avatar</p>
            <p className="text-xs text-neutral-500">
              Visible to workspace members.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Name"
            required
            error={form.formState.errors.name ? "Required field" : undefined}
          >
            <Input
              autoComplete="name"
              {...form.register("name", { required: true })}
            />
          </FormField>
          <FormField
            label="Email"
            required
            error={form.formState.errors.email ? "Required field" : undefined}
          >
            <Input
              type="email"
              autoComplete="email"
              {...form.register("email", { required: true })}
            />
          </FormField>
        </div>
        <section
          className="space-y-3 border-t border-neutral-800 pt-4"
          aria-labelledby="telegram-title"
        >
          <div>
            <h3 id="telegram-title" className="font-semibold text-white">
              Telegram identity
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Choose one identity source for workspace workflows.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-neutral-800 bg-neutral-950/60 p-1">
            <Mode
              active={identityMode === "username"}
              label="Username"
              onClick={() => {
                setIdentityMode("username");
                form.setValue("telegramUserAccountIds", [], {
                  shouldDirty: true,
                });
              }}
            />
            <Mode
              active={identityMode === "account"}
              label="Connected account"
              onClick={() => {
                setIdentityMode("account");
                form.setValue("telegramUsername", "", { shouldDirty: true });
              }}
            />
          </div>
          {identityMode === "username" ? (
            <FormField label="Telegram username">
              <Input
                autoComplete="off"
                placeholder="@username"
                {...form.register("telegramUsername")}
              />
              <p className="mt-1.5 text-xs text-neutral-500">
                Used when no connected account is assigned.
              </p>
            </FormField>
          ) : (
            <div className="space-y-2">
              <FormField label="Telegram account">
                <CustomSelect
                  value={selectedAccountId}
                  onChange={(id) =>
                    form.setValue("telegramUserAccountIds", id ? [id] : [], {
                      shouldDirty: true,
                    })
                  }
                  placeholder={
                    accountsLoading
                      ? "Loading accounts…"
                      : "Select connected account"
                  }
                  disabled={accountsLoading || !accounts.length}
                  options={accounts.map((item) => ({
                    value: item.id,
                    label: accountTitle(item),
                    meta: item.username
                      ? `@${item.username.replace(/^@/, "")}`
                      : item.label,
                    iconUrl: item.photoUrl,
                    iconFallback: accountTitle(item),
                  }))}
                />
              </FormField>
              {selectedAccount ? (
                <SelectedAccount account={selectedAccount} />
              ) : (
                <p className="rounded-lg border border-dashed border-neutral-800 p-3 text-sm text-neutral-500">
                  {accounts.length
                    ? "Select an account to show it on your profile."
                    : "No available connected Telegram accounts."}
                </p>
              )}
            </div>
          )}
        </section>
        <FormError message={error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm({
  form,
  error,
  pending,
  onSubmit,
}: {
  form: ReturnType<typeof useForm<PasswordValues>>;
  error: string;
  pending: boolean;
  onSubmit: (values: PasswordValues) => void;
}) {
  return (
    <Card className="max-w-3xl">
      <div className="mb-5">
        <h3 className="font-semibold">Change password</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Use at least 8 characters and keep it different from your current
          password.
        </p>
      </div>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          label="Current password"
          required
          error={
            form.formState.errors.currentPassword ? "Required field" : undefined
          }
        >
          <Input
            type="password"
            autoComplete="current-password"
            {...form.register("currentPassword", { required: true })}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="New password"
            required
            error={
              form.formState.errors.newPassword
                ? "Use at least 8 characters"
                : undefined
            }
          >
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("newPassword", {
                required: true,
                minLength: 8,
              })}
            />
          </FormField>
          <FormField
            label="Confirm new password"
            required
            error={
              form.formState.errors.confirmNewPassword
                ? "Required field"
                : undefined
            }
          >
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("confirmNewPassword", { required: true })}
            />
          </FormField>
        </div>
        <FormError message={error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Tab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium sm:flex-none ${active ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
    >
      {icon}
      {label}
    </button>
  );
}
function Mode({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
    >
      {label}
    </button>
  );
}
function SelectedAccount({ account }: { account: TelegramUserAccount }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-700 bg-neutral-800">
        {account.photoUrl ? (
          <img
            src={account.photoUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Send size={18} className="text-sky-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{accountTitle(account)}</p>
        <p className="truncate text-xs text-neutral-500">
          {account.username
            ? `@${account.username.replace(/^@/, "")}`
            : account.label}
        </p>
      </div>
      <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-300">
        Connected
      </span>
    </div>
  );
}
