"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Send, UserRound } from "lucide-react";
import { IconPicker } from "@/components/icons/icon-picker";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Card,
  CustomSelect,
  ErrorState,
  FormError,
  FormField,
  Input,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import { accountApi, telegramUserAccountsApi } from "@/lib/api";
import {
  accountKeys,
  authKeys,
  memberKeys,
  telegramAccountKeys,
} from "@/lib/query-keys";
import { useI18n } from "@/providers/i18n-provider";
import { localizedAccountError } from "@/lib/features/workspace/account-error";
import { AccountMemberFinance } from "./account-member-finance";

type AccountTab = "profile" | "password";
type IdentityMode = "username" | "account";
type ProfileValues = {
  name: string;
  email: string;
  telegramUsername: string;
  telegramUserAccountIds: string[];
  salesCommissionRate: string;
};
type PasswordValues = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};
type ProfileTelegramAccount = {
  id: string;
  label: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
};

const accountTitle = (account: ProfileTelegramAccount) =>
  [account.firstName, account.lastName].filter(Boolean).join(" ") ||
  account.label;

export function AccountWorkspace() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AccountTab>("profile");
  const [identityMode, setIdentityMode] = useState<IdentityMode>("username");
  const [profileError, setProfileError] = useState<unknown>(null);
  const [passwordError, setPasswordError] = useState<unknown>(null);
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
      salesCommissionRate:
        account.data?.salesCommissionRate == null
          ? ""
          : String(account.data.salesCommissionRate),
    },
  });
  const passwordForm = useForm<PasswordValues>();

  useEffect(() => {
    if (!account.data) return;
    // Async account data hydrates controls outside react-hook-form.
    setAvatarIconId(
      account.data.avatarIconId ?? account.data.avatarIcon?.id ?? null,
    );
    setIdentityMode(
      account.data.assignedTelegramUserAccounts?.length
        ? "account"
        : "username",
    );
  }, [account.data]);

  const availableAccounts = useMemo(() => {
    const profileAccounts = account.data?.assignedTelegramUserAccounts ?? [];
    const assignedIds = new Set(profileAccounts.map(({ id }) => id));
    const workspaceAccounts = (telegramAccounts.data ?? []).filter(
      (item) => !item.assignedMember || assignedIds.has(item.id),
    );
    return [
      ...profileAccounts,
      ...workspaceAccounts.filter(({ id }) => !assignedIds.has(id)),
    ];
  }, [account.data?.assignedTelegramUserAccounts, telegramAccounts.data]);
  const selectedAccountId =
    useWatch({
      control: profileForm.control,
      name: "telegramUserAccountIds",
    })?.[0] ?? "";
  const selectedAccount = availableAccounts.find(
    ({ id }) => id === selectedAccountId,
  );

  const updateProfile = useMutation({
    mutationFn: accountApi.updateMe,
    onSuccess: (updated) => {
      setProfileError(null);
      queryClient.setQueryData(accountKeys.me(), updated);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: authKeys.me() }),
        queryClient.invalidateQueries({ queryKey: memberKeys.members() }),
        queryClient.invalidateQueries({
          queryKey: telegramAccountKeys.accounts(),
        }),
      ]);
    },
    onError: setProfileError,
  });
  const updatePassword = useMutation({
    mutationFn: accountApi.updatePassword,
    onSuccess: () => {
      setPasswordError(null);
      passwordForm.reset();
    },
    onError: setPasswordError,
  });

  return (
    <AppShell>
      <PageHeader
        title={t("account.page.title")}
        subtitle={t("account.page.subtitle")}
      />
      <div
        className="mb-4 inline-flex w-full rounded-xl border border-neutral-800 bg-neutral-900/60 p-1 sm:w-auto"
        role="tablist"
        aria-label={t("account.sections")}
      >
        <Tab
          active={tab === "profile"}
          onClick={() => setTab("profile")}
          icon={<UserRound size={16} />}
          label={t("account.tabs.profile")}
        />
        <Tab
          active={tab === "password"}
          onClick={() => setTab("password")}
          icon={<KeyRound size={16} />}
          label={t("account.tabs.password")}
        />
      </div>
      {account.isError && !account.data ? (
        <Card className="max-w-3xl space-y-3">
          <ErrorState text={t("account.errors.loadProfile")} />
          <Button variant="secondary" onClick={() => void account.refetch()}>
            {t("account.actions.retry")}
          </Button>
        </Card>
      ) : account.isLoading || !account.data ? (
        <LoadingState />
      ) : tab === "profile" ? (
        <>
          <ProfileForm
            data={account.data}
            form={profileForm}
            avatarIconId={avatarIconId}
            setAvatarIconId={setAvatarIconId}
            identityMode={identityMode}
            setIdentityMode={setIdentityMode}
            accounts={availableAccounts}
            accountsLoading={telegramAccounts.isLoading}
            accountsError={telegramAccounts.isError}
            retryAccounts={() => void telegramAccounts.refetch()}
            selectedAccount={selectedAccount}
            selectedAccountId={selectedAccountId}
            error={
              profileError
                ? localizedAccountError(
                    profileError,
                    t,
                    "account.errors.updateProfile",
                  )
                : ""
            }
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
                salesCommissionRate:
                  account.data.workspace.role === "owner"
                    ? values.salesCommissionRate === ""
                      ? null
                      : Number(values.salesCommissionRate)
                    : undefined,
              })
            }
          />
          <AccountMemberFinance
            memberId={account.data.workspaceMemberId}
            name={account.data.name}
            canManage={account.data.workspace.role === "owner"}
          />
        </>
      ) : (
        <PasswordForm
          form={passwordForm}
          error={
            passwordError
              ? localizedAccountError(
                  passwordError,
                  t,
                  "account.errors.updatePassword",
                )
              : ""
          }
          pending={updatePassword.isPending}
          onSubmit={(values) =>
            updatePassword.mutate({
              currentPassword: values.currentPassword,
              newPassword: values.newPassword,
            })
          }
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
  accountsError,
  retryAccounts,
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
  accounts: ProfileTelegramAccount[];
  accountsLoading: boolean;
  accountsError: boolean;
  retryAccounts: () => void;
  selectedAccount?: ProfileTelegramAccount;
  selectedAccountId: string;
  error: string;
  pending: boolean;
  onSubmit: (values: ProfileValues) => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="max-w-3xl">
      <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
          <IconPicker
            compact
            iconId={avatarIconId}
            icon={data.avatarPresentation}
            onChange={setAvatarIconId}
            buttonLabel={t("account.avatar.change")}
            className="!h-14 !w-14 !overflow-hidden !rounded-xl !border-neutral-700 !bg-neutral-950 text-xl"
            iconClassName="!h-full !w-full !rounded-xl !border-0 !bg-transparent"
          />
          <div>
            <p className="font-medium text-white">
              {t("account.avatar.title")}
            </p>
            <p className="text-xs text-neutral-500">
              {t("account.avatar.description")}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("account.fields.name")}
            required
            error={
              form.formState.errors.name
                ? t("account.validation.required")
                : undefined
            }
          >
            <Input
              aria-label={t("account.fields.name")}
              autoComplete="name"
              {...form.register("name", { required: true })}
            />
          </FormField>
          <FormField
            label={t("account.fields.email")}
            required
            error={
              form.formState.errors.email
                ? t("account.validation.required")
                : undefined
            }
          >
            <Input
              aria-label={t("account.fields.email")}
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
              {t("account.telegram.title")}
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              {t("account.telegram.description")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-neutral-800 bg-neutral-950/60 p-1">
            <Mode
              active={identityMode === "username"}
              label={t("account.telegram.usernameMode")}
              onClick={() => {
                setIdentityMode("username");
                form.setValue("telegramUserAccountIds", [], {
                  shouldDirty: true,
                });
              }}
            />
            <Mode
              active={identityMode === "account"}
              label={t("account.telegram.accountMode")}
              onClick={() => {
                setIdentityMode("account");
                form.setValue("telegramUsername", "", { shouldDirty: true });
              }}
            />
          </div>
          {identityMode === "username" ? (
            <FormField label={t("account.telegram.username")}>
              <Input
                aria-label={t("account.telegram.username")}
                autoComplete="off"
                placeholder="@username"
                {...form.register("telegramUsername")}
              />
              <p className="mt-1.5 text-xs text-neutral-500">
                {t("account.telegram.usernameHelp")}
              </p>
            </FormField>
          ) : (
            <div className="space-y-2">
              <FormField label={t("account.telegram.account")}>
                <CustomSelect
                  value={selectedAccountId}
                  onChange={(id) =>
                    form.setValue("telegramUserAccountIds", id ? [id] : [], {
                      shouldDirty: true,
                    })
                  }
                  placeholder={
                    accountsLoading
                      ? t("account.telegram.loadingAccounts")
                      : t("account.telegram.selectAccount")
                  }
                  disabled={accountsLoading || !accounts.length}
                  options={accounts.map((item) => ({
                    value: item.id,
                    label: accountTitle(item),
                    meta: item.username
                      ? `@${item.username.replace(/^@/, "")}`
                      : item.label,
                    iconUrl: item.photoUrl ?? undefined,
                    iconFallback: accountTitle(item),
                  }))}
                />
              </FormField>
              {accountsError ? (
                <div className="space-y-2">
                  <ErrorState text={t("account.errors.loadTelegramAccounts")} />
                  <Button variant="secondary" onClick={retryAccounts}>
                    {t("account.actions.retry")}
                  </Button>
                </div>
              ) : selectedAccount ? (
                <SelectedAccount account={selectedAccount} />
              ) : (
                <p className="rounded-lg border border-dashed border-neutral-800 p-3 text-sm text-neutral-500">
                  {accounts.length
                    ? t("account.telegram.selectPrompt")
                    : t("account.telegram.noneAvailable")}
                </p>
              )}
            </div>
          )}
        </section>
        {data.workspace.role === "owner" ? (
          <section className="space-y-2 border-t border-neutral-800 pt-4">
            <div>
              <h3 className="font-semibold text-white">Sales commission</h3>
              <p className="mt-0.5 text-xs text-neutral-500">
                Leave this blank to use the workspace default. Your chosen rate
                is saved with each new deal.
              </p>
            </div>
            <FormField label="My commission override, %">
              <Input
                type="number"
                aria-label="My commission override, %"
                min="0"
                max="100"
                step="0.01"
                placeholder="Use workspace default"
                {...form.register("salesCommissionRate", {
                  validate: (value) =>
                    value === "" ||
                    (Number.isFinite(Number(value)) &&
                      Number(value) >= 0 &&
                      Number(value) <= 100) ||
                    "Enter a rate from 0 to 100",
                })}
              />
              {form.formState.errors.salesCommissionRate ? (
                <p className="mt-1 text-xs text-rose-300">
                  {form.formState.errors.salesCommissionRate.message}
                </p>
              ) : null}
            </FormField>
          </section>
        ) : null}
        <FormError message={error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? t("account.actions.saving") : t("account.actions.save")}
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
  const { t } = useI18n();
  const passwordToggleLabels = {
    show: t("account.password.show"),
    hide: t("account.password.hide"),
  };
  return (
    <Card className="max-w-3xl">
      <div className="mb-5">
        <h3 className="font-semibold">{t("account.password.title")}</h3>
        <p className="mt-1 text-sm text-neutral-500">
          {t("account.password.description")}
        </p>
      </div>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          label={t("account.password.current")}
          required
          error={
            form.formState.errors.currentPassword
              ? t("account.validation.required")
              : undefined
          }
        >
          <Input
            type="password"
            aria-label={t("account.password.current")}
            passwordToggleLabels={passwordToggleLabels}
            autoComplete="current-password"
            {...form.register("currentPassword", { required: true })}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("account.password.new")}
            required
            error={
              form.formState.errors.newPassword
                ? t("account.validation.passwordMin")
                : undefined
            }
          >
            <Input
              type="password"
              aria-label={t("account.password.new")}
              passwordToggleLabels={passwordToggleLabels}
              autoComplete="new-password"
              {...form.register("newPassword", {
                required: true,
                minLength: 8,
              })}
            />
          </FormField>
          <FormField
            label={t("account.password.confirm")}
            required
            error={
              form.formState.errors.confirmNewPassword?.type === "validate"
                ? t("account.validation.passwordMismatch")
                : form.formState.errors.confirmNewPassword
                  ? t("account.validation.required")
                  : undefined
            }
          >
            <Input
              type="password"
              aria-label={t("account.password.confirm")}
              passwordToggleLabels={passwordToggleLabels}
              autoComplete="new-password"
              {...form.register("confirmNewPassword", {
                required: true,
                validate: (value) => value === form.getValues("newPassword"),
              })}
            />
          </FormField>
        </div>
        <FormError message={error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending
              ? t("account.password.updating")
              : t("account.password.update")}
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
function SelectedAccount({ account }: { account: ProfileTelegramAccount }) {
  const { t } = useI18n();
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
        {t("account.telegram.connected")}
      </span>
    </div>
  );
}
