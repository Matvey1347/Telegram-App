import { useOptionalI18n } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";
const keys: Record<string, TranslationKey> = {
  "Candidate first-offer operations only": "aiUsage.candidate_offers_only",
  "History filter only. Financial totals above retain the selected category scope.": "aiUsage.candidate_history_scope",
  "Candidate preparation": "aiUsage.candidate_preparation",
  "Unresolved / held operations · all ages": "aiUsage.held_0",
  "Date and status filters are ignored for this list. Reservations stay held until verified reconciliation; active requests cannot be settled.":
    "aiUsage.held_1",

  "Apply filters": "aiUsage.apply_filters",
  "Monthly budget trend": "aiUsage.monthly_budget_trend",
  "Cumulative known costs within the selected days of this month. Unknown charges and reservations are excluded.":
    "aiUsage.extra.1",
  "Total tokens": "aiUsage.total_tokens",
  "AI Usage": "aiUsage.ai_usage",
  "Usage & requests": "aiUsage.usage_requests",
  Configuration: "aiUsage.copy.2",
  "Loading access…": "aiUsage.loading_access",
  "AI usage permission is required for this workspace.":
    "aiUsage.ai_usage_permission_is_required_for_this_workspace",
  "Workspace access could not be loaded.":
    "aiUsage.workspace_access_could_not_be_loaded",
  Retry: "aiUsage.copy.6",
  "Loading usage…": "aiUsage.loading_usage",
  "Loading configuration…": "aiUsage.loading_configuration",
  "Loading requests…": "aiUsage.loading_requests",
  "Loading sales usage…": "aiUsage.loading_sales_usage",
  "Execution controls": "aiUsage.execution_controls",
  "Workspace limits": "aiUsage.workspace_limits",
  "Selected period": "aiUsage.selected_period",
  Today: "aiUsage.copy.14",
  "7 days": "aiUsage.7_days",
  "30 days": "aiUsage.30_days",
  "This month": "aiUsage.this_month",
  "Known cost": "aiUsage.known_cost",
  "Requests / errors": "aiUsage.requests_errors",
  "Average priced request": "aiUsage.average_priced_request",
  "Pending / unresolved": "aiUsage.pending_unresolved",
  "Input tokens": "aiUsage.input_tokens",
  "Output tokens": "aiUsage.output_tokens",
  "Cached / cache write": "aiUsage.cached_cache_write",
  "Reasoning (within output)": "aiUsage.reasoning_within_output",
  "Daily known cost · USD": "aiUsage.daily_known_cost_usd",
  "Unknown charges are excluded. Chart values are rounded for display.":
    "aiUsage.copy.27",
  "No usage in this period.": "aiUsage.no_usage_in_this_period",
  "Budget balances": "aiUsage.budget_balances",
  "Spent and reserved charges count toward limits. Unconfigured workspace limits block execution.":
    "aiUsage.copy.30",
  "By feature": "aiUsage.by_feature",
  "By model": "aiUsage.by_model",
  "No recorded usage.": "aiUsage.no_recorded_usage",
  Requests: "aiUsage.copy.34",
  "Telemetry only. Prompts, responses and credentials are excluded.":
    "aiUsage.copy.35",
  "Date / feature": "aiUsage.date_feature",
  Model: "aiUsage.copy.37",
  "Tokens in / out": "aiUsage.tokens_in_out",
  "Cost / reserved USD": "aiUsage.cost_reserved_usd",
  Duration: "aiUsage.copy.40",
  "Status / error": "aiUsage.status_error",
  Reconcile: "aiUsage.copy.42",
  "No requests match these filters.": "aiUsage.no_requests_match_these_filters",
  "Load more": "aiUsage.load_more",
  "Reconcile uncertain charge": "aiUsage.reconcile_uncertain_charge",
  "Use a verified provider invoice or audit record. This settles the reservation and never calls the AI provider.":
    "aiUsage.copy.46",
  "Verified cost (USD)": "aiUsage.verified_cost_usd",
  "Evidence reference": "aiUsage.evidence_reference",
  "I verified this amount against the provider record.":
    "aiUsage.i_verified_this_amount_against_the_provider_record",
  "Settlement failed. Check permissions and evidence, then retry.":
    "aiUsage.copy.50",
  "Confirm settlement": "aiUsage.confirm_settlement",
  Cancel: "aiUsage.copy.52",
  "From (UTC)": "aiUsage.from_utc",
  "To (UTC)": "aiUsage.to_utc",
  Feature: "aiUsage.copy.55",
  "All features": "aiUsage.all_features",
  Provider: "aiUsage.copy.57",
  "All providers": "aiUsage.all_providers",
  "Model filter": "aiUsage.model_filter",
  "Exact model ID": "aiUsage.exact_model_id",
  Status: "aiUsage.copy.61",
  "All statuses": "aiUsage.all_statuses",
  "Daily budget (USD)": "aiUsage.daily_budget_usd",
  "Monthly budget (USD)": "aiUsage.monthly_budget_usd",
  "Maximum request cost (USD)": "aiUsage.maximum_request_cost_usd",
  "Not configured": "aiUsage.not_configured",
  "Maximum input tokens": "aiUsage.maximum_input_tokens",
  "Maximum output tokens": "aiUsage.maximum_output_tokens",
  "Timeout (ms)": "aiUsage.timeout_ms",
  "Concurrency limit": "aiUsage.concurrency_limit",
  "Budget warning (%)": "aiUsage.budget_warning",
  Enabled: "aiUsage.copy.72",
  "Automatic execution allowed": "aiUsage.automatic_execution_allowed",
  "Save controls": "aiUsage.save_controls",
  "Saving…": "aiUsage.saving",
  "Configuration saved.": "aiUsage.configuration_saved",
  "Configuration could not be saved. Check limits and permissions.":
    "aiUsage.copy.77",
  "Read-only. AI management permission is required.":
    "aiUsage.read_only_ai_management_permission_is_required",
  "Verified model prices · USD / 1M tokens":
    "aiUsage.verified_model_prices_usd_1m_tokens",
  "Open system AI Usage →": "aiUsage.open_system_ai_usage",
  "Workspace costs, token usage and execution limits. USD · UTC · 90-day history.":
    "aiUsage.copy.81",
  "Choose up to 90 days. Leave dates empty for the last 30 days. Workspace selection uses the shared switcher.":
    "aiUsage.copy.82",
  "Usage could not be loaded. Check the date range and retry.":
    "aiUsage.copy.83",
  "Configuration could not be loaded.":
    "aiUsage.configuration_could_not_be_loaded",
  "Requests could not be loaded.": "aiUsage.requests_could_not_be_loaded",
  "Sales usage could not be loaded.": "aiUsage.sales_usage_could_not_be_loaded",
};
export function useAiText() {
  const i18n = useOptionalI18n();
  return (value: string): string =>
    keys[value] && i18n ? i18n.t(keys[value]) : value;
}
