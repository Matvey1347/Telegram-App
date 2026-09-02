import type { TranslationCatalog } from "@/i18n/types";

const messages = {
  "account.meta.title": "My Profile · Nexeloq",
  "account.page.title": "My Profile",
  "account.page.subtitle": "Personal details, Telegram identity and security",
  "account.sections": "Profile sections",
  "account.tabs.profile": "Profile settings",
  "account.tabs.password": "Change password",
  "account.avatar.change": "Change avatar",
  "account.avatar.title": "Profile avatar",
  "account.avatar.description": "Visible to workspace members.",
  "account.fields.name": "Name",
  "account.fields.email": "Email",
  "account.telegram.title": "Telegram identity",
  "account.telegram.description":
    "Choose one identity source for workspace workflows.",
  "account.telegram.usernameMode": "Username",
  "account.telegram.accountMode": "Connected account",
  "account.telegram.username": "Telegram username",
  "account.telegram.usernameHelp":
    "Used when no connected account is assigned.",
  "account.telegram.account": "Telegram account",
  "account.telegram.loadingAccounts": "Loading accounts…",
  "account.telegram.selectAccount": "Select connected account",
  "account.telegram.selectPrompt":
    "Select an account to show it on your profile.",
  "account.telegram.noneAvailable": "No available connected Telegram accounts.",
  "account.telegram.connected": "Connected",
  "account.actions.save": "Save changes",
  "account.actions.saving": "Saving…",
  "account.actions.retry": "Try again",
  "account.password.title": "Change password",
  "account.password.description":
    "Use at least 8 characters and keep it different from your current password.",
  "account.password.current": "Current password",
  "account.password.new": "New password",
  "account.password.confirm": "Confirm new password",
  "account.password.show": "Show password",
  "account.password.hide": "Hide password",
  "account.password.update": "Update password",
  "account.password.updating": "Updating…",
  "account.validation.required": "Required field",
  "account.validation.passwordMin": "Use at least 8 characters",
  "account.validation.passwordMismatch":
    "New password confirmation does not match",
  "account.errors.network":
    "Unable to connect to the server. Please try again later.",
  "account.errors.loadProfile": "Failed to load your profile.",
  "account.errors.loadTelegramAccounts":
    "Failed to load connected Telegram accounts.",
  "account.errors.updateProfile": "Failed to update profile.",
  "account.errors.updatePassword": "Failed to update password.",
  "account.errors.nameEmpty": "Name cannot be empty.",
  "account.errors.emailAlreadyExists":
    "An account with this email already exists.",
  "account.errors.avatarNotFound": "The selected avatar was not found.",
  "account.errors.telegramUsernameAssigned":
    "This Telegram username is already assigned to another workspace member.",
  "account.errors.telegramAccountsNotFound":
    "One or more Telegram accounts were not found in this workspace.",
  "account.errors.telegramAccountsAssigned":
    "One or more Telegram accounts are already linked to another workspace member.",
  "account.errors.currentPasswordIncorrect": "Current password is incorrect.",
} as const satisfies TranslationCatalog;

export default messages;
