import { useOptionalI18n } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";
const keys: Record<string, TranslationKey> = {
  "A versioned review aid, not a calibrated purchase probability or fraud verdict.":
    "leadQualification.a_versioned_review_aid_not_a_calibrated_purchase_probability_or_fraud_verdict",
  "AI-discovered sources and prepared offers":
    "leadQualification.ai_discovered_sources_and_prepared_offers",
  "Action failed. Check current evidence, identity, source grant, budget and revision. Reload before retrying.":
    "leadQualification.action_failed_check_current_evidence_identity_source_grant_budget_and_revision_reload_before_retrying",
  "All candidates": "leadQualification.all_candidates",
  "Apply candidate filters": "leadQualification.apply_candidate_filters",
  "Apply this human review decision to the selected candidates? No AI or message is sent.":
    "leadQualification.apply_this_human_review_decision_to_the_selected_candidates_no_ai_or_message_is_sent",
  "Approve first message": "leadQualification.approve_first_message",
  "Approve selected": "leadQualification.approve_selected",
  "Approved message copied. Sending remains a separate manual action.":
    "leadQualification.approved_message_copied_sending_remains_a_separate_manual_action",
  "Back to candidates": "leadQualification.back_to_candidates",
  "Bulk review failed. Reload stale or inaccessible candidates and review again.":
    "leadQualification.bulk_review_failed_reload_stale_or_inaccessible_candidates_and_review_again",
  "Bulk review never qualifies or generates AI messages.":
    "leadQualification.bulk_review_never_qualifies_or_generates_ai_messages",
  Cancel: "leadQualification.cancel",
  "Candidate details": "leadQualification.candidate_details",
  "Candidate draft language": "leadQualification.candidate_draft_language",
  "Candidate draft tone": "leadQualification.candidate_draft_tone",
  "Choose real products / packages":
    "leadQualification.choose_real_products_packages",
  "Confirm bulk review": "leadQualification.confirm_bulk_review",
  "Confirm qualified": "leadQualification.confirm_qualified",
  "Confirm selected review": "leadQualification.confirm_selected_review",
  "Copy approved message": "leadQualification.copy_approved_message",
  "Copy blocked. Reload current source, contact and approval state.":
    "leadQualification.copy_blocked_reload_current_source_contact_and_approval_state",
  Discard: "leadQualification.discard",
  "Evidence not linked": "leadQualification.evidence_not_linked",
  "Evidence quality": "leadQualification.evidence_quality",
  Expires: "leadQualification.expires",
  "Explain score factors": "leadQualification.explain_score_factors",
  "Generate first offer": "leadQualification.generate_first_offer",
  HIGH_PRIORITY: "leadQualification.state_high_priority",
  "Human decision": "leadQualification.human_decision",
  "I reviewed the high-risk evidence and take responsibility for this separate decision.":
    "leadQualification.i_reviewed_the_high_risk_evidence_and_take_responsibility_for_this_separate_decision",
  "Insufficient evidence": "leadQualification.insufficient_evidence",
  LINKED: "leadQualification.state_linked",
  LOW_RELEVANCE: "leadQualification.state_low_relevance",
  Language: "leadQualification.language",
  "Lead workflow filters": "leadQualification.lead_workflow_filters",
  "Linked evidence unavailable. Check current CRM and Lead permissions.":
    "leadQualification.linked_evidence_unavailable_check_current_crm_and_lead_permissions",
  "Load more candidates": "leadQualification.load_more_candidates",
  "Load more products": "leadQualification.load_more_products",
  "Loading products…": "leadQualification.loading_products",
  "Loading qualification…": "leadQualification.loading_qualification",
  "Low relevance": "leadQualification.state_low_relevance",
  "Manager qualification decision":
    "leadQualification.manager_qualification_decision",
  "Missing information": "leadQualification.missing_information",
  "More acquisition records exist. Use the review queue for the remaining candidates.":
    "leadQualification.more_acquisition_records_exist_use_the_review_queue_for_the_remaining_candidates",
  NEEDS_REVIEW: "leadQualification.state_needs_review",
  NEW: "leadQualification.state_new",
  "Needs review": "leadQualification.state_needs_review",
  "No conversation is created here. Candidate approval does not authorize a Telegram send.":
    "leadQualification.no_conversation_is_created_here_candidate_approval_does_not_authorize_a_telegram_send",
  "No linked Discovery evidence.":
    "leadQualification.no_linked_discovery_evidence",
  "No qualification yet. Confirm the business contact and inspect evidence first.":
    "leadQualification.no_qualification_yet_confirm_the_business_contact_and_inspect_evidence_first",
  "No usable qualification result yet. Unknown usage must be reconciled before another paid attempt.":
    "leadQualification.no_usable_qualification_result_yet_unknown_usage_must_be_reconciled_before_another_paid_attempt",
  "Only selected current products prove prices. Package totals and audience claims need verified facts.":
    "leadQualification.only_selected_current_products_prove_prices_package_totals_and_audience_claims_need_verified_facts",
  "Overall priority": "leadQualification.overall_priority",
  "Personalized first offer": "leadQualification.personalized_first_offer",
  "Preparation is gated by current permissions, evidence, source policy and budget.":
    "leadQualification.preparation_is_gated_by_current_permissions_evidence_source_policy_and_budget",
  "Preparation unavailable. Check workspace permissions and retry.":
    "leadQualification.preparation_unavailable_check_workspace_permissions_and_retry",
  "Prepared first message": "leadQualification.prepared_first_message",
  "Product selection changed. Qualify and review this context before generating.":
    "leadQualification.product_selection_changed_qualify_and_review_this_context_before_generating",
  "Products unavailable. Check Sales permissions.":
    "leadQualification.products_unavailable_check_sales_permissions",
  QUALIFIED: "leadQualification.state_qualified",
  "Qualification and first offer":
    "leadQualification.qualification_and_first_offer",
  "Qualification and message generation are separate budgeted actions. Opening this card calls no AI.":
    "leadQualification.qualification_and_message_generation_are_separate_budgeted_actions_opening_this_card_calls_no_ai",
  "Qualify explicitly with AI": "leadQualification.qualify_explicitly_with_ai",
  "Quote required": "leadQualification.quote_required",
  REJECTED: "leadQualification.state_rejected",
  RISK_HIGH: "leadQualification.state_risk_high",
  RISK_LOW: "leadQualification.state_risk_low",
  RISK_MEDIUM: "leadQualification.state_risk_medium",
  RISK_UNKNOWN: "leadQualification.state_risk_unknown",
  "Reject selected": "leadQualification.reject_selected",
  Relevance: "leadQualification.relevance",
  Reload: "leadQualification.reload",
  Retry: "leadQualification.retry",
  "Review evidence, qualify explicitly, then prepare a first offer. No automatic generation, rejection or outreach.":
    "leadQualification.review_evidence_qualify_explicitly_then_prepare_a_first_offer_no_automatic_generation_rejection_or_outreach",
  Revision: "leadQualification.revision",
  "Risk level": "leadQualification.risk_level",
  "Risk review note": "leadQualification.risk_review_note",
  "Risk signals require human verification":
    "leadQualification.risk_signals_require_human_verification",
  SUSPICIOUS: "leadQualification.state_suspicious",
  "Save changes": "leadQualification.save_changes",
  "Save the edit, then approve again. Typing does not write to the server.":
    "leadQualification.save_the_edit_then_approve_again_typing_does_not_write_to_the_server",
  "Saving or preparing… Please wait; no automatic retry.":
    "leadQualification.saving_or_preparing_please_wait_no_automatic_retry",
  "Search candidates": "leadQualification.search_candidates",
  Select: "leadQualification.select",
  "Select a candidate to inspect evidence and prepare an offer.":
    "leadQualification.select_a_candidate_to_inspect_evidence_and_prepare_an_offer",
  "Select no more than 20 candidates.":
    "leadQualification.select_no_more_than_20_candidates",
  "Select products": "leadQualification.select_products",
  "Selected products (up to 5)": "leadQualification.selected_products_up_to_5",
  "This draft needs current evidence and approval. No automatic retry or send.":
    "leadQualification.this_draft_needs_current_evidence_and_approval_no_automatic_retry_or_send",
  Tone: "leadQualification.tone",
  "Unknown niche": "leadQualification.unknown_niche",
  "View cited evidence": "leadQualification.view_cited_evidence",
  Workflow: "leadQualification.workflow",
};
export function useQualificationText() {
  const i18n = useOptionalI18n();
  return (text: string) => {
    const key = keys[text];
    const value = key && i18n ? i18n.t(key) : text;
    return value === key ? text : value;
  };
}
