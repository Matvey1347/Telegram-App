import { useOptionalI18n } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";
const keys: Record<string, TranslationKey> = {
  "Stop waiting": "copilot.extra_0",
  "Generation may continue and incur cost; reopen Copilot to recover. No automatic retry.":
    "copilot.extra_1",
  "Load more products": "copilot.extra_2",
  "Retry products": "copilot.extra_3",
  "Generation outcome is uncertain or still running. Reopen drafts to check saved state; a new suggestion is a new explicitly paid operation.":
    "copilot.extra_4",

  Operation: "copilot.operation",
  Tone: "copilot.tone",
  Language: "copilot.language",
  "Conversation language": "copilot.conversation_language",
  "Products / packages (up to 5)": "copilot.products_packages_up_to_5",
  "Choose verified products": "copilot.choose_verified_products",
  "Include permitted client notes": "copilot.include_permitted_client_notes",
  "Approved processing basis": "copilot.approved_processing_basis",
  "Approved business processing": "copilot.approved_business_processing",
  "Documented consent": "copilot.documented_consent",
  "Processing reference": "copilot.processing_reference",
  "Approved policy or consent record":
    "copilot.approved_policy_or_consent_record",
  "I verified the source policy and processing basis for sending this selected context to OpenAI.":
    "copilot.i_verified_the_source_policy_and_processing_basis_for_sending_this_selected_context_to_openai",
  "Manager attestation does not override the deployment privacy gate. Processing is disabled until an approved server-side policy is configured.":
    "copilot.manager_attestation_does_not_override_the_deployment_privacy_gate_processing_is_disabled_until_an_approved_server_side_policy_is_configured",
  "AI Copilot details": "copilot.ai_copilot_details",
  "Recommended next action": "copilot.recommended_next_action",
  "Verified context references": "copilot.verified_context_references",
  "Stored facts are untrusted input. References do not prove a model claim is correct.":
    "copilot.stored_facts_are_untrusted_input_references_do_not_prove_a_model_claim_is_correct",
  "Used fact IDs": "copilot.used_fact_ids",
  "Missing facts": "copilot.missing_facts",
  Warnings: "copilot.warnings",
  "Generation cost": "copilot.generation_cost",
  "Prices, permission and DNC are checked again before approval and manual sending. No action runs automatically.":
    "copilot.prices_permission_and_dnc_are_checked_again_before_approval_and_manual_sending_no_action_runs_automatically",
  "Suggested message": "copilot.suggested_message",
  "Human review required. Verify every claim before approval.":
    "copilot.human_review_required_verify_every_claim_before_approval",
  "Context, status or prices may have changed. Save and obtain fresh approval before sending.":
    "copilot.context_status_or_prices_may_have_changed_save_and_obtain_fresh_approval_before_sending",
  "Edited text must be saved and approved again.":
    "copilot.edited_text_must_be_saved_and_approved_again",
  "Save edited draft": "copilot.save_edited_draft",
  "Approve reviewed text": "copilot.approve_reviewed_text",
  "Insert approved text": "copilot.insert_approved_text",
  Discard: "copilot.discard",
  "Insertion does not send. Review the composer, then use the existing Send button.":
    "copilot.insertion_does_not_send_review_the_composer_then_use_the_existing_send_button",
  "Human approval only": "copilot.human_approval_only",
  "AI never sends messages or changes CRM status. Manual chat stays available.":
    "copilot.ai_never_sends_messages_or_changes_crm_status_manual_chat_stays_available",
  "Loading AI drafts…": "copilot.loading_ai_drafts",
  "No saved AI drafts. Prepare context to create a suggestion.":
    "copilot.no_saved_ai_drafts_prepare_context_to_create_a_suggestion",
  "This saved AI draft is unavailable or expired. Keep the text for review; it cannot be reapproved here.":
    "copilot.this_saved_ai_draft_is_unavailable_or_expired_keep_the_text_for_review_it_cannot_be_reapproved_here",
  "Draft could not be updated. Check current permissions, context and prices, then retry.":
    "copilot.draft_could_not_be_updated_check_current_permissions_context_and_prices_then_retry",
  "Prepare context & generation": "copilot.prepare_context_generation",
  "Copilot details": "copilot.copilot_details",
  "Loading bounded context…": "copilot.loading_bounded_context",
  "Retry context": "copilot.retry_context",
  "AI processing is disabled by the deployment privacy policy. Configure an approved processing policy before generation.":
    "copilot.ai_processing_is_disabled_by_the_deployment_privacy_policy_configure_an_approved_processing_policy_before_generation",
  "Generating…": "copilot.generating",
  "Regenerate suggestion": "copilot.regenerate_suggestion",
  "Generate suggestion": "copilot.generate_suggestion",
  "Cancel generation": "copilot.cancel_generation",
  "Check same operation": "copilot.check_same_operation",
  "Generation outcome is uncertain or unavailable. No automatic paid retry occurs. Check the same operation, or explicitly request a new suggestion. Manual chat remains available.":
    "copilot.generation_outcome_is_uncertain_or_unavailable_no_automatic_paid_retry_occurs_check_the_same_operation_or_explicitly_request_a_new_suggestion_manual_chat_remains_available",
  "Retry drafts": "copilot.retry_drafts",
  "Insert approved AI text?": "copilot.insert_approved_ai_text",
  "Your existing message drafts will be kept. Create a separate composer draft with the approved AI text?":
    "copilot.your_existing_message_drafts_will_be_kept_create_a_separate_composer_draft_with_the_approved_ai_text",
  "Create AI composer draft": "copilot.create_ai_composer_draft",
  "Keep current draft": "copilot.keep_current_draft",
  "Review edited AI text": "copilot.review_edited_ai_text",
  "AI text changed — save and approve again before sending.":
    "copilot.ai_text_changed_save_and_approve_again_before_sending",
  "Approved AI text · manual Send required":
    "copilot.approved_ai_text_manual_send_required",
  "No recommendation yet": "copilot.no_recommendation_yet",
  "Generate a suggestion to see a short explanation.":
    "copilot.generate_a_suggestion_to_see_a_short_explanation",
};
export function useCopilotText() {
  const i18n = useOptionalI18n();
  return (text: string) => (keys[text] && i18n ? i18n.t(keys[text]) : text);
}
