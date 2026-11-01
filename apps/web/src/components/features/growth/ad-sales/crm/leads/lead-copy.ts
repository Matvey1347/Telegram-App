import { useOptionalI18n } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";
const keys: Record<string, TranslationKey> = {
  "Lead Discovery": "leadDiscovery.lead_discovery",
  Sources: "leadDiscovery.sources",
  "Advertisement feed": "leadDiscovery.advertisement_feed",
  "Review queue": "leadDiscovery.review_queue",
  "Permitted sources → advertisement evidence → human review → existing CRM.":
    "leadDiscovery.permitted_sources_advertisement_evidence_human_review_existing_crm",
  "Loading workspace access…": "leadDiscovery.loading_workspace_access",
  "Lead Discovery view permission is required.":
    "leadDiscovery.lead_discovery_view_permission_is_required",
  "Loading Lead Discovery…": "leadDiscovery.loading_lead_discovery",
  "Loading lead candidates…": "leadDiscovery.loading_lead_candidates",
  "No records match these filters.":
    "leadDiscovery.no_records_match_these_filters",
  Retry: "leadDiscovery.retry",
  "Add source": "leadDiscovery.add_source",
  "Add lead source": "leadDiscovery.add_lead_source",
  "Import source list": "leadDiscovery.import_source_list",
  "Export CSV": "leadDiscovery.export_csv",
  "Export XLSX": "leadDiscovery.export_xlsx",
  "Export failed. Retry with current access.":
    "leadDiscovery.export_failed_retry_with_current_access",
  "Export contains the first 1,000 sources only.":
    "leadDiscovery.export_contains_the_first_1_000_sources_only",
  "Search sources": "leadDiscovery.search_sources",
  "Source name or identifier": "leadDiscovery.source_name_or_identifier",
  "Source status": "leadDiscovery.source_status",
  "All statuses": "leadDiscovery.all_statuses",
  "Apply source filters": "leadDiscovery.apply_source_filters",
  "Load more sources": "leadDiscovery.load_more_sources",
  "Source type": "leadDiscovery.source_type",
  "Telegram channel": "leadDiscovery.telegram_channel",
  "Manual material source": "leadDiscovery.manual_material_source",
  "Manual source label": "leadDiscovery.manual_source_label",
  "Username, Telegram link or supported identifier":
    "leadDiscovery.username_telegram_link_or_supported_identifier",
  "Source title": "leadDiscovery.source_title",
  "Approved processing reference":
    "leadDiscovery.approved_processing_reference",
  "I deliberately allow this own channel for an approved use case":
    "leadDiscovery.i_deliberately_allow_this_own_channel_for_an_approved_use_case",
  "New sources are reviewed and validated before monitoring. No automatic channel join or AI analysis.":
    "leadDiscovery.new_sources_are_reviewed_and_validated_before_monitoring_no_automatic_channel_join_or_ai_analysis",
  "Source could not be added. Check reference, grants and access.":
    "leadDiscovery.source_could_not_be_added_check_reference_grants_and_access",
  "Choose from an existing live account":
    "leadDiscovery.choose_from_an_existing_live_account",
  "This lists permitted channels using an existing connection. It never joins channels. Own channels require a separate explicit manual override.":
    "leadDiscovery.this_lists_permitted_channels_using_an_existing_connection_it_never_joins_channels_own_channels_require_a_separate_explicit_manual_override",
  "Select a live account": "leadDiscovery.select_a_live_account",
  "Available accounts could not be loaded.":
    "leadDiscovery.available_accounts_could_not_be_loaded",
  "No existing live account is available. Start the existing account integration before requesting channels.":
    "leadDiscovery.no_existing_live_account_is_available_start_the_existing_account_integration_before_requesting_channels",
  "Choose source": "leadDiscovery.choose_source",
  "Load more channels": "leadDiscovery.load_more_channels",
  Format: "leadDiscovery.format",
  "Text list": "leadDiscovery.text_list",
  "Source list": "leadDiscovery.source_list",
  "At most 100 sources. Preview first; imports never join channels or enable monitoring.":
    "leadDiscovery.at_most_100_sources_preview_first_imports_never_join_channels_or_enable_monitoring",
  "Preview sources": "leadDiscovery.preview_sources",
  "Import preview failed. Check format and the 100-source limit.":
    "leadDiscovery.import_preview_failed_check_format_and_the_100_source_limit",
  "Import valid new sources": "leadDiscovery.import_valid_new_sources",
  "Import failed. Existing sources remain unchanged; retry explicitly.":
    "leadDiscovery.import_failed_existing_sources_remain_unchanged_retry_explicitly",
  "Validate access": "leadDiscovery.validate_access",
  "Recover available updates": "leadDiscovery.recover_available_updates",
  "Disable source": "leadDiscovery.disable_source",
  "Import materials": "leadDiscovery.import_materials",
  "Processing settings": "leadDiscovery.processing_settings",
  "Source processing settings": "leadDiscovery.source_processing_settings",
  "Save source settings": "leadDiscovery.save_source_settings",
  "Source settings could not be saved.":
    "leadDiscovery.source_settings_could_not_be_saved",
  "A reference does not create a grant. Deployment-reviewed source/workspace/account permissions and expiry remain authoritative.":
    "leadDiscovery.a_reference_does_not_create_a_grant_deployment_reviewed_source_workspace_account_permissions_and_expiry_remain_authoritative",
  "Action failed. Check deployment grants, live account, source access and limits. No automatic join or retry occurs.":
    "leadDiscovery.action_failed_check_deployment_grants_live_account_source_access_and_limits_no_automatic_join_or_retry_occurs",
  "Import permitted materials": "leadDiscovery.import_permitted_materials",
  "Up to 20 text materials from an approved source. No media downloads, AI calls or messages are triggered.":
    "leadDiscovery.up_to_20_text_materials_from_an_approved_source_no_media_downloads_ai_calls_or_messages_are_triggered",
  "External message ID": "leadDiscovery.external_message_id",
  "Permitted source text": "leadDiscovery.permitted_source_text",
  "Published date (UTC)": "leadDiscovery.published_date_utc",
  "Time (UTC)": "leadDiscovery.time_utc",
  "Original message link (optional)":
    "leadDiscovery.original_message_link_optional",
  "Add material": "leadDiscovery.add_material",
  "Remove material": "leadDiscovery.remove_material",
  "Provide a valid message ID, text and UTC publication date for every material.":
    "leadDiscovery.provide_a_valid_message_id_text_and_utc_publication_date_for_every_material",
  "Materials were not imported. Check source grants, limits and original identities.":
    "leadDiscovery.materials_were_not_imported_check_source_grants_limits_and_original_identities",
  Classification: "leadDiscovery.classification",
  "All classes": "leadDiscovery.all_classes",
  "Evidence review": "leadDiscovery.evidence_review",
  "All reviews": "leadDiscovery.all_reviews",
  "Risk status": "leadDiscovery.risk_status",
  "All risk states": "leadDiscovery.all_risk_states",
  "Apply feed filters": "leadDiscovery.apply_feed_filters",
  "Select no more than 5 materials.":
    "leadDiscovery.select_no_more_than_5_materials",
  "Load more materials": "leadDiscovery.load_more_materials",
  "Only permitted evidence is listed. Nothing is analyzed on page open. Select up to 5 materials for explicit budget-controlled classification and contact extraction.":
    "leadDiscovery.only_permitted_evidence_is_listed_nothing_is_analyzed_on_page_open_select_up_to_5_materials_for_explicit_budget_controlled_classification_and_contact_extraction",
  "Analysis could not complete. Check AI budgets, permissions, source/AI grants and held usage. No automatic paid retry occurs.":
    "leadDiscovery.analysis_could_not_complete_check_ai_budgets_permissions_source_ai_grants_and_held_usage_no_automatic_paid_retry_occurs",
  "Analyze selection": "leadDiscovery.analyze_selection",
  "Commercial intent is not proof of paid placement.":
    "leadDiscovery.commercial_intent_is_not_proof_of_paid_placement",
  "Open original reference": "leadDiscovery.open_original_reference",
  "The original is deleted, unavailable or not linked. Saved evidence is not a currently available original.":
    "leadDiscovery.the_original_is_deleted_unavailable_or_not_linked_saved_evidence_is_not_a_currently_available_original",
  "Approve evidence": "leadDiscovery.approve_evidence",
  "Reject evidence": "leadDiscovery.reject_evidence",
  "Create candidate manually": "leadDiscovery.create_candidate_manually",
  "Evidence review failed. Check current access and state.":
    "leadDiscovery.evidence_review_failed_check_current_access_and_state",
  "Create a candidate from evidence":
    "leadDiscovery.create_a_candidate_from_evidence",
  "Manual fallback uses this approved material only. No AI call, CRM client or commercial conversation is created.":
    "leadDiscovery.manual_fallback_uses_this_approved_material_only_no_ai_call_crm_client_or_commercial_conversation_is_created",
  "Advertiser / project title": "leadDiscovery.advertiser_project_title",
  "Public business contact type (optional)":
    "leadDiscovery.public_business_contact_type_optional",
  "Public contact value": "leadDiscovery.public_contact_value",
  "Contact role": "leadDiscovery.contact_role",
  "Evidence for the contact": "leadDiscovery.evidence_for_the_contact",
  "Create review candidate": "leadDiscovery.create_review_candidate",
  "Candidate could not be created. Confirm source eligibility, evidence approval and contact syntax.":
    "leadDiscovery.candidate_could_not_be_created_confirm_source_eligibility_evidence_approval_and_contact_syntax",
  "A channel link is not automatically the advertiser or sales contact. Instagram is a manual business reference only.":
    "leadDiscovery.a_channel_link_is_not_automatically_the_advertiser_or_sales_contact_instagram_is_a_manual_business_reference_only",
  "Search candidates": "leadDiscovery.search_candidates",
  "Candidate review": "leadDiscovery.candidate_review",
  "Apply candidate filters": "leadDiscovery.apply_candidate_filters",
  "Select no more than 20 candidates.":
    "leadDiscovery.select_no_more_than_20_candidates",
  "Load more candidates": "leadDiscovery.load_more_candidates",
  "CRM client not linked": "leadDiscovery.crm_client_not_linked",
  "Open linked CRM client →": "leadDiscovery.open_linked_crm_client",
  "Candidates are review records, not conversations. Only a human can approve evidence and create/link an existing CRM client. Nothing is sent automatically.":
    "leadDiscovery.candidates_are_review_records_not_conversations_only_a_human_can_approve_evidence_and_create_link_an_existing_crm_client_nothing_is_sent_automatically",
  "Bulk review failed. Reload stale or inaccessible candidates and review again.":
    "leadDiscovery.bulk_review_failed_reload_stale_or_inaccessible_candidates_and_review_again",
  "Reload details": "leadDiscovery.reload_details",
  "All linked sources": "leadDiscovery.all_linked_sources",
  "Public business contacts": "leadDiscovery.public_business_contacts",
  "No verified business contact was found.":
    "leadDiscovery.no_verified_business_contact_was_found",
  "Open business reference manually":
    "leadDiscovery.open_business_reference_manually",
  "Advertisement evidence": "leadDiscovery.advertisement_evidence",
  "Additional evidence exists. Use the bounded source feed to inspect remaining materials; this detail view is truncated.":
    "leadDiscovery.additional_evidence_exists_use_the_bounded_source_feed_to_inspect_remaining_materials_this_detail_view_is_truncated",
  "Review history": "leadDiscovery.review_history",
  "No review action yet.": "leadDiscovery.no_review_action_yet",
  "Human review & CRM": "leadDiscovery.human_review_crm",
  "Confirm each public business contact and its role from evidence. A destination link does not prove ownership. Risk signals are not a fraud verdict.":
    "leadDiscovery.confirm_each_public_business_contact_and_its_role_from_evidence_a_destination_link_does_not_prove_ownership_risk_signals_are_not_a_fraud_verdict",
  "Reviewed risk status": "leadDiscovery.reviewed_risk_status",
  "Approve candidate": "leadDiscovery.approve_candidate",
  "Reject candidate": "leadDiscovery.reject_candidate",
  "CRM creation/linking requires an approved acceptable candidate and a confirmed advertiser or sales contact. No conversation or outreach is created.":
    "leadDiscovery.crm_creation_linking_requires_an_approved_acceptable_candidate_and_a_confirmed_advertiser_or_sales_contact_no_conversation_or_outreach_is_created",
  "CRM client name": "leadDiscovery.crm_client_name",
  "Create CRM client": "leadDiscovery.create_crm_client",
  "Link existing CRM client": "leadDiscovery.link_existing_crm_client",
  "Confirm client link": "leadDiscovery.confirm_client_link",
  "Possible aliases — manual decision only":
    "leadDiscovery.possible_aliases_manual_decision_only",
  "Choose a verified duplicate": "leadDiscovery.choose_a_verified_duplicate",
  "I verified these records represent the same advertiser":
    "leadDiscovery.i_verified_these_records_represent_the_same_advertiser",
  "Merge reviewed duplicate": "leadDiscovery.merge_reviewed_duplicate",
  "Review failed. Permissions, revision, evidence or CRM linkage may have changed. Reload details before retrying.":
    "leadDiscovery.review_failed_permissions_revision_evidence_or_crm_linkage_may_have_changed_reload_details_before_retrying",
  "Search clients": "leadDiscovery.search_clients",
  "Client name or business identifier":
    "leadDiscovery.client_name_or_business_identifier",
  "Choose an existing client": "leadDiscovery.choose_an_existing_client",
  "Selected client": "leadDiscovery.selected_client",
  "Load more clients": "leadDiscovery.load_more_clients",
  "CRM clients could not be loaded. Check CRM view permissions.":
    "leadDiscovery.crm_clients_could_not_be_loaded_check_crm_view_permissions",
  "All sources": "leadDiscovery.all_sources",
  "Selected source": "leadDiscovery.selected_source",
  "Load source choices": "leadDiscovery.load_source_choices",
  "Source choices could not be loaded.":
    "leadDiscovery.source_choices_could_not_be_loaded",
  "Open Lead Discovery →": "leadDiscovery.open_lead_discovery",
  "Lead Discovery could not be loaded. Manual Inbox conversations remain available.":
    "leadDiscovery.lead_discovery_could_not_be_loaded_manual_inbox_conversations_remain_available",
  "NO_ADS_30D requires proven continuous coverage, never source age. Missing access, missing data and low yield are distinct states. Sources are separate from our advertising inventory.":
    "leadDiscovery.no_ads_30d_requires_proven_continuous_coverage_never_source_age_missing_access_missing_data_and_low_yield_are_distinct_states_sources_are_separate_from_our_advertising_inventory",
  "Source, workspace and account grants with an approved reference and expiry are required. Access to a channel does not grant ingest or AI processing permission. Live monitoring ingests only; Analyze is an explicit budget-controlled action.":
    "leadDiscovery.source_workspace_and_account_grants_with_an_approved_reference_and_expiry_are_required_access_to_a_channel_does_not_grant_ingest_or_ai_processing_permission_live_monitoring_ingests_only_analyze_is_an_explicit_budget_controlled_action",
  "Qualified leads require explicit AI qualification and human review. Instagram references remain manual business links; no Direct or crawling.":
    "leadDiscovery.qualified_leads_stay_0_until_the_separate_qualification_stage_instagram_references_are_manual_business_links_only_no_direct_or_crawling",
};
export function useLeadText() {
  const i18n = useOptionalI18n();
  return (text: string) => {
    const key = keys[text];
    const translated = key && i18n ? i18n.t(key) : text;
    return translated === key ? text : translated;
  };
}
