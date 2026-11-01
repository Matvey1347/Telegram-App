import type { TranslationCatalog } from "@/i18n/types";

const messages = {
  "leadQualification.a_versioned_review_aid_not_a_calibrated_purchase_probability_or_fraud_verdict":
    "A versioned review aid, not a calibrated purchase probability or fraud verdict.",
  "leadQualification.ai_discovered_sources_and_prepared_offers":
    "AI-discovered sources and prepared offers",
  "leadQualification.action_failed_check_current_evidence_identity_source_grant_budget_and_revision_reload_before_retrying":
    "Action failed. Check current evidence, identity, source grant, budget and revision. Reload before retrying.",
  "leadQualification.all_candidates": "All candidates",
  "leadQualification.apply_candidate_filters": "Apply candidate filters",
  "leadQualification.apply_this_human_review_decision_to_the_selected_candidates_no_ai_or_message_is_sent":
    "Apply this human review decision to the selected candidates? No AI or message is sent.",
  "leadQualification.approve_first_message": "Approve first message",
  "leadQualification.approve_selected": "Approve selected",
  "leadQualification.approved_message_copied_sending_remains_a_separate_manual_action":
    "Approved message copied. Sending remains a separate manual action.",
  "leadQualification.back_to_candidates": "Back to candidates",
  "leadQualification.bulk_review_failed_reload_stale_or_inaccessible_candidates_and_review_again":
    "Bulk review failed. Reload stale or inaccessible candidates and review again.",
  "leadQualification.bulk_review_never_qualifies_or_generates_ai_messages":
    "Bulk review never qualifies or generates AI messages.",
  "leadQualification.cancel": "Cancel",
  "leadQualification.candidate_details": "Candidate details",
  "leadQualification.candidate_draft_language": "Candidate draft language",
  "leadQualification.candidate_draft_tone": "Candidate draft tone",
  "leadQualification.choose_real_products_packages":
    "Choose real products / packages",
  "leadQualification.confirm_bulk_review": "Confirm bulk review",
  "leadQualification.confirm_qualified": "Confirm qualified",
  "leadQualification.confirm_selected_review": "Confirm selected review",
  "leadQualification.copy_approved_message": "Copy approved message",
  "leadQualification.copy_blocked_reload_current_source_contact_and_approval_state":
    "Copy blocked. Reload current source, contact and approval state.",
  "leadQualification.discard": "Discard",
  "leadQualification.evidence_not_linked": "Evidence not linked",
  "leadQualification.evidence_quality": "Evidence quality",
  "leadQualification.expires": "Expires",
  "leadQualification.explain_score_factors": "Explain score factors",
  "leadQualification.generate_first_offer": "Generate first offer",
  "leadQualification.state_high_priority": "High priority",
  "leadQualification.human_decision": "Human decision",
  "leadQualification.i_reviewed_the_high_risk_evidence_and_take_responsibility_for_this_separate_decision":
    "I reviewed the high-risk evidence and take responsibility for this separate decision.",
  "leadQualification.insufficient_evidence": "Insufficient evidence",
  "leadQualification.state_linked": "Linked",
  "leadQualification.state_low_relevance": "Low relevance",
  "leadQualification.language": "Language",
  "leadQualification.lead_workflow_filters": "Lead workflow filters",
  "leadQualification.linked_evidence_unavailable_check_current_crm_and_lead_permissions":
    "Linked evidence unavailable. Check current CRM and Lead permissions.",
  "leadQualification.load_more_candidates": "Load more candidates",
  "leadQualification.load_more_products": "Load more products",
  "leadQualification.loading_products": "Loading products…",
  "leadQualification.loading_qualification": "Loading qualification…",
  "leadQualification.low_relevance": "Low relevance",
  "leadQualification.manager_qualification_decision":
    "Manager qualification decision",
  "leadQualification.missing_information": "Missing information",
  "leadQualification.more_acquisition_records_exist_use_the_review_queue_for_the_remaining_candidates":
    "More acquisition records exist. Use the review queue for the remaining candidates.",
  "leadQualification.state_needs_review": "Needs review",
  "leadQualification.state_new": "New",
  "leadQualification.needs_review": "Needs review",
  "leadQualification.no_conversation_is_created_here_candidate_approval_does_not_authorize_a_telegram_send":
    "No conversation is created here. Candidate approval does not authorize a Telegram send.",
  "leadQualification.no_linked_discovery_evidence":
    "No linked Discovery evidence.",
  "leadQualification.no_qualification_yet_confirm_the_business_contact_and_inspect_evidence_first":
    "No qualification yet. Confirm the business contact and inspect evidence first.",
  "leadQualification.no_usable_qualification_result_yet_unknown_usage_must_be_reconciled_before_another_paid_attempt":
    "No usable qualification result yet. Unknown usage must be reconciled before another paid attempt.",
  "leadQualification.only_selected_current_products_prove_prices_package_totals_and_audience_claims_need_verified_facts":
    "Only selected current products prove prices. Package totals and audience claims need verified facts.",
  "leadQualification.overall_priority": "Overall priority",
  "leadQualification.personalized_first_offer": "Personalized first offer",
  "leadQualification.preparation_is_gated_by_current_permissions_evidence_source_policy_and_budget":
    "Preparation is gated by current permissions, evidence, source policy and budget.",
  "leadQualification.preparation_unavailable_check_workspace_permissions_and_retry":
    "Preparation unavailable. Check workspace permissions and retry.",
  "leadQualification.prepared_first_message": "Prepared first message",
  "leadQualification.product_selection_changed_qualify_and_review_this_context_before_generating":
    "Product selection changed. Qualify and review this context before generating.",
  "leadQualification.products_unavailable_check_sales_permissions":
    "Products unavailable. Check Sales permissions.",
  "leadQualification.state_qualified": "Qualified",
  "leadQualification.qualification_and_first_offer":
    "Qualification and first offer",
  "leadQualification.qualification_and_message_generation_are_separate_budgeted_actions_opening_this_card_calls_no_ai":
    "Qualification and message generation are separate budgeted actions. Opening this card calls no AI.",
  "leadQualification.qualify_explicitly_with_ai": "Qualify explicitly with AI",
  "leadQualification.quote_required": "Quote required",
  "leadQualification.state_rejected": "Rejected",
  "leadQualification.state_risk_high": "Risk high",
  "leadQualification.state_risk_low": "Risk low",
  "leadQualification.state_risk_medium": "Risk medium",
  "leadQualification.state_risk_unknown": "Risk unknown",
  "leadQualification.reject_selected": "Reject selected",
  "leadQualification.relevance": "Relevance",
  "leadQualification.reload": "Reload",
  "leadQualification.retry": "Retry",
  "leadQualification.review_evidence_qualify_explicitly_then_prepare_a_first_offer_no_automatic_generation_rejection_or_outreach":
    "Review evidence, qualify explicitly, then prepare a first offer. No automatic generation, rejection or outreach.",
  "leadQualification.revision": "Revision",
  "leadQualification.risk_level": "Risk level",
  "leadQualification.risk_review_note": "Risk review note",
  "leadQualification.risk_signals_require_human_verification":
    "Risk signals require human verification",
  "leadQualification.state_suspicious": "Suspicious",
  "leadQualification.save_changes": "Save changes",
  "leadQualification.save_the_edit_then_approve_again_typing_does_not_write_to_the_server":
    "Save the edit, then approve again. Typing does not write to the server.",
  "leadQualification.saving_or_preparing_please_wait_no_automatic_retry":
    "Saving or preparing… Please wait; no automatic retry.",
  "leadQualification.search_candidates": "Search candidates",
  "leadQualification.select": "Select",
  "leadQualification.select_a_candidate_to_inspect_evidence_and_prepare_an_offer":
    "Select a candidate to inspect evidence and prepare an offer.",
  "leadQualification.select_no_more_than_20_candidates":
    "Select no more than 20 candidates.",
  "leadQualification.select_products": "Select products",
  "leadQualification.selected_products_up_to_5": "Selected products (up to 5)",
  "leadQualification.this_draft_needs_current_evidence_and_approval_no_automatic_retry_or_send":
    "This draft needs current evidence and approval. No automatic retry or send.",
  "leadQualification.tone": "Tone",
  "leadQualification.unknown_niche": "Unknown niche",
  "leadQualification.view_cited_evidence": "View cited evidence",
  "leadQualification.workflow": "Workflow",

  "leadDiscovery.lead_discovery": "Lead Discovery",
  "leadDiscovery.sources": "Sources",
  "leadDiscovery.advertisement_feed": "Advertisement feed",
  "leadDiscovery.review_queue": "Review queue",
  "leadDiscovery.permitted_sources_advertisement_evidence_human_review_existing_crm":
    "Permitted sources → advertisement evidence → human review → existing CRM.",
  "leadDiscovery.loading_workspace_access": "Loading workspace access…",
  "leadDiscovery.lead_discovery_view_permission_is_required":
    "Lead Discovery view permission is required.",
  "leadDiscovery.loading_lead_discovery": "Loading Lead Discovery…",
  "leadDiscovery.loading_lead_candidates": "Loading lead candidates…",
  "leadDiscovery.no_records_match_these_filters":
    "No records match these filters.",
  "leadDiscovery.retry": "Retry",
  "leadDiscovery.add_source": "Add source",
  "leadDiscovery.add_lead_source": "Add lead source",
  "leadDiscovery.import_source_list": "Import source list",
  "leadDiscovery.export_csv": "Export CSV",
  "leadDiscovery.export_xlsx": "Export XLSX",
  "leadDiscovery.export_failed_retry_with_current_access":
    "Export failed. Retry with current access.",
  "leadDiscovery.export_contains_the_first_1_000_sources_only":
    "Export contains the first 1,000 sources only.",
  "leadDiscovery.search_sources": "Search sources",
  "leadDiscovery.source_name_or_identifier": "Source name or identifier",
  "leadDiscovery.source_status": "Source status",
  "leadDiscovery.all_statuses": "All statuses",
  "leadDiscovery.apply_source_filters": "Apply source filters",
  "leadDiscovery.load_more_sources": "Load more sources",
  "leadDiscovery.source_type": "Source type",
  "leadDiscovery.telegram_channel": "Telegram channel",
  "leadDiscovery.manual_material_source": "Manual material source",
  "leadDiscovery.manual_source_label": "Manual source label",
  "leadDiscovery.username_telegram_link_or_supported_identifier":
    "Username, Telegram link or supported identifier",
  "leadDiscovery.source_title": "Source title",
  "leadDiscovery.approved_processing_reference":
    "Approved processing reference",
  "leadDiscovery.i_deliberately_allow_this_own_channel_for_an_approved_use_case":
    "I deliberately allow this own channel for an approved use case",
  "leadDiscovery.new_sources_are_reviewed_and_validated_before_monitoring_no_automatic_channel_join_or_ai_analysis":
    "New sources are reviewed and validated before monitoring. No automatic channel join or AI analysis.",
  "leadDiscovery.source_could_not_be_added_check_reference_grants_and_access":
    "Source could not be added. Check reference, grants and access.",
  "leadDiscovery.choose_from_an_existing_live_account":
    "Choose from an existing live account",
  "leadDiscovery.this_lists_permitted_channels_using_an_existing_connection_it_never_joins_channels_own_channels_require_a_separate_explicit_manual_override":
    "This lists permitted channels using an existing connection. It never joins channels. Own channels require a separate explicit manual override.",
  "leadDiscovery.select_a_live_account": "Select a live account",
  "leadDiscovery.available_accounts_could_not_be_loaded":
    "Available accounts could not be loaded.",
  "leadDiscovery.no_existing_live_account_is_available_start_the_existing_account_integration_before_requesting_channels":
    "No existing live account is available. Start the existing account integration before requesting channels.",
  "leadDiscovery.choose_source": "Choose source",
  "leadDiscovery.load_more_channels": "Load more channels",
  "leadDiscovery.format": "Format",
  "leadDiscovery.text_list": "Text list",
  "leadDiscovery.source_list": "Source list",
  "leadDiscovery.at_most_100_sources_preview_first_imports_never_join_channels_or_enable_monitoring":
    "At most 100 sources. Preview first; imports never join channels or enable monitoring.",
  "leadDiscovery.preview_sources": "Preview sources",
  "leadDiscovery.import_preview_failed_check_format_and_the_100_source_limit":
    "Import preview failed. Check format and the 100-source limit.",
  "leadDiscovery.import_valid_new_sources": "Import valid new sources",
  "leadDiscovery.import_failed_existing_sources_remain_unchanged_retry_explicitly":
    "Import failed. Existing sources remain unchanged; retry explicitly.",
  "leadDiscovery.validate_access": "Validate access",
  "leadDiscovery.recover_available_updates": "Recover available updates",
  "leadDiscovery.disable_source": "Disable source",
  "leadDiscovery.import_materials": "Import materials",
  "leadDiscovery.processing_settings": "Processing settings",
  "leadDiscovery.source_processing_settings": "Source processing settings",
  "leadDiscovery.save_source_settings": "Save source settings",
  "leadDiscovery.source_settings_could_not_be_saved":
    "Source settings could not be saved.",
  "leadDiscovery.a_reference_does_not_create_a_grant_deployment_reviewed_source_workspace_account_permissions_and_expiry_remain_authoritative":
    "A reference does not create a grant. Deployment-reviewed source/workspace/account permissions and expiry remain authoritative.",
  "leadDiscovery.action_failed_check_deployment_grants_live_account_source_access_and_limits_no_automatic_join_or_retry_occurs":
    "Action failed. Check deployment grants, live account, source access and limits. No automatic join or retry occurs.",
  "leadDiscovery.import_permitted_materials": "Import permitted materials",
  "leadDiscovery.up_to_20_text_materials_from_an_approved_source_no_media_downloads_ai_calls_or_messages_are_triggered":
    "Up to 20 text materials from an approved source. No media downloads, AI calls or messages are triggered.",
  "leadDiscovery.external_message_id": "External message ID",
  "leadDiscovery.permitted_source_text": "Permitted source text",
  "leadDiscovery.published_date_utc": "Published date (UTC)",
  "leadDiscovery.time_utc": "Time (UTC)",
  "leadDiscovery.original_message_link_optional":
    "Original message link (optional)",
  "leadDiscovery.add_material": "Add material",
  "leadDiscovery.remove_material": "Remove material",
  "leadDiscovery.provide_a_valid_message_id_text_and_utc_publication_date_for_every_material":
    "Provide a valid message ID, text and UTC publication date for every material.",
  "leadDiscovery.materials_were_not_imported_check_source_grants_limits_and_original_identities":
    "Materials were not imported. Check source grants, limits and original identities.",
  "leadDiscovery.classification": "Classification",
  "leadDiscovery.all_classes": "All classes",
  "leadDiscovery.evidence_review": "Evidence review",
  "leadDiscovery.all_reviews": "All reviews",
  "leadDiscovery.risk_status": "Risk status",
  "leadDiscovery.all_risk_states": "All risk states",
  "leadDiscovery.apply_feed_filters": "Apply feed filters",
  "leadDiscovery.select_no_more_than_5_materials":
    "Select no more than 5 materials.",
  "leadDiscovery.load_more_materials": "Load more materials",
  "leadDiscovery.only_permitted_evidence_is_listed_nothing_is_analyzed_on_page_open_select_up_to_5_materials_for_explicit_budget_controlled_classification_and_contact_extraction":
    "Only permitted evidence is listed. Nothing is analyzed on page open. Select up to 5 materials for explicit budget-controlled classification and contact extraction.",
  "leadDiscovery.analysis_could_not_complete_check_ai_budgets_permissions_source_ai_grants_and_held_usage_no_automatic_paid_retry_occurs":
    "Analysis could not complete. Check AI budgets, permissions, source/AI grants and held usage. No automatic paid retry occurs.",
  "leadDiscovery.analyze_selection": "Analyze selection",
  "leadDiscovery.commercial_intent_is_not_proof_of_paid_placement":
    "Commercial intent is not proof of paid placement.",
  "leadDiscovery.open_original_reference": "Open original reference",
  "leadDiscovery.the_original_is_deleted_unavailable_or_not_linked_saved_evidence_is_not_a_currently_available_original":
    "The original is deleted, unavailable or not linked. Saved evidence is not a currently available original.",
  "leadDiscovery.approve_evidence": "Approve evidence",
  "leadDiscovery.reject_evidence": "Reject evidence",
  "leadDiscovery.create_candidate_manually": "Create candidate manually",
  "leadDiscovery.evidence_review_failed_check_current_access_and_state":
    "Evidence review failed. Check current access and state.",
  "leadDiscovery.create_a_candidate_from_evidence":
    "Create a candidate from evidence",
  "leadDiscovery.manual_fallback_uses_this_approved_material_only_no_ai_call_crm_client_or_commercial_conversation_is_created":
    "Manual fallback uses this approved material only. No AI call, CRM client or commercial conversation is created.",
  "leadDiscovery.advertiser_project_title": "Advertiser / project title",
  "leadDiscovery.public_business_contact_type_optional":
    "Public business contact type (optional)",
  "leadDiscovery.public_contact_value": "Public contact value",
  "leadDiscovery.contact_role": "Contact role",
  "leadDiscovery.evidence_for_the_contact": "Evidence for the contact",
  "leadDiscovery.create_review_candidate": "Create review candidate",
  "leadDiscovery.candidate_could_not_be_created_confirm_source_eligibility_evidence_approval_and_contact_syntax":
    "Candidate could not be created. Confirm source eligibility, evidence approval and contact syntax.",
  "leadDiscovery.a_channel_link_is_not_automatically_the_advertiser_or_sales_contact_instagram_is_a_manual_business_reference_only":
    "A channel link is not automatically the advertiser or sales contact. Instagram is a manual business reference only.",
  "leadDiscovery.search_candidates": "Search candidates",
  "leadDiscovery.candidate_review": "Candidate review",
  "leadDiscovery.apply_candidate_filters": "Apply candidate filters",
  "leadDiscovery.select_no_more_than_20_candidates":
    "Select no more than 20 candidates.",
  "leadDiscovery.load_more_candidates": "Load more candidates",
  "leadDiscovery.crm_client_not_linked": "CRM client not linked",
  "leadDiscovery.open_linked_crm_client": "Open linked CRM client →",
  "leadDiscovery.candidates_are_review_records_not_conversations_only_a_human_can_approve_evidence_and_create_link_an_existing_crm_client_nothing_is_sent_automatically":
    "Candidates are review records, not conversations. Only a human can approve evidence and create/link an existing CRM client. Nothing is sent automatically.",
  "leadDiscovery.bulk_review_failed_reload_stale_or_inaccessible_candidates_and_review_again":
    "Bulk review failed. Reload stale or inaccessible candidates and review again.",
  "leadDiscovery.reload_details": "Reload details",
  "leadDiscovery.all_linked_sources": "All linked sources",
  "leadDiscovery.public_business_contacts": "Public business contacts",
  "leadDiscovery.no_verified_business_contact_was_found":
    "No verified business contact was found.",
  "leadDiscovery.open_business_reference_manually":
    "Open business reference manually",
  "leadDiscovery.advertisement_evidence": "Advertisement evidence",
  "leadDiscovery.additional_evidence_exists_use_the_bounded_source_feed_to_inspect_remaining_materials_this_detail_view_is_truncated":
    "Additional evidence exists. Use the bounded source feed to inspect remaining materials; this detail view is truncated.",
  "leadDiscovery.review_history": "Review history",
  "leadDiscovery.no_review_action_yet": "No review action yet.",
  "leadDiscovery.human_review_crm": "Human review & CRM",
  "leadDiscovery.confirm_each_public_business_contact_and_its_role_from_evidence_a_destination_link_does_not_prove_ownership_risk_signals_are_not_a_fraud_verdict":
    "Confirm each public business contact and its role from evidence. A destination link does not prove ownership. Risk signals are not a fraud verdict.",
  "leadDiscovery.reviewed_risk_status": "Reviewed risk status",
  "leadDiscovery.approve_candidate": "Approve candidate",
  "leadDiscovery.reject_candidate": "Reject candidate",
  "leadDiscovery.crm_creation_linking_requires_an_approved_acceptable_candidate_and_a_confirmed_advertiser_or_sales_contact_no_conversation_or_outreach_is_created":
    "CRM creation/linking requires an approved acceptable candidate and a confirmed advertiser or sales contact. No conversation or outreach is created.",
  "leadDiscovery.crm_client_name": "CRM client name",
  "leadDiscovery.create_crm_client": "Create CRM client",
  "leadDiscovery.link_existing_crm_client": "Link existing CRM client",
  "leadDiscovery.confirm_client_link": "Confirm client link",
  "leadDiscovery.possible_aliases_manual_decision_only":
    "Possible aliases — manual decision only",
  "leadDiscovery.choose_a_verified_duplicate": "Choose a verified duplicate",
  "leadDiscovery.i_verified_these_records_represent_the_same_advertiser":
    "I verified these records represent the same advertiser",
  "leadDiscovery.merge_reviewed_duplicate": "Merge reviewed duplicate",
  "leadDiscovery.review_failed_permissions_revision_evidence_or_crm_linkage_may_have_changed_reload_details_before_retrying":
    "Review failed. Permissions, revision, evidence or CRM linkage may have changed. Reload details before retrying.",
  "leadDiscovery.search_clients": "Search clients",
  "leadDiscovery.client_name_or_business_identifier":
    "Client name or business identifier",
  "leadDiscovery.choose_an_existing_client": "Choose an existing client",
  "leadDiscovery.selected_client": "Selected client",
  "leadDiscovery.load_more_clients": "Load more clients",
  "leadDiscovery.crm_clients_could_not_be_loaded_check_crm_view_permissions":
    "CRM clients could not be loaded. Check CRM view permissions.",
  "leadDiscovery.all_sources": "All sources",
  "leadDiscovery.selected_source": "Selected source",
  "leadDiscovery.load_source_choices": "Load source choices",
  "leadDiscovery.source_choices_could_not_be_loaded":
    "Source choices could not be loaded.",
  "leadDiscovery.open_lead_discovery": "Open Lead Discovery →",
  "leadDiscovery.lead_discovery_could_not_be_loaded_manual_inbox_conversations_remain_available":
    "Lead Discovery could not be loaded. Manual Inbox conversations remain available.",
  "leadDiscovery.no_ads_30d_requires_proven_continuous_coverage_never_source_age_missing_access_missing_data_and_low_yield_are_distinct_states_sources_are_separate_from_our_advertising_inventory":
    "NO_ADS_30D requires proven continuous coverage, never source age. Missing access, missing data and low yield are distinct states. Sources are separate from our advertising inventory.",
  "leadDiscovery.source_workspace_and_account_grants_with_an_approved_reference_and_expiry_are_required_access_to_a_channel_does_not_grant_ingest_or_ai_processing_permission_live_monitoring_ingests_only_analyze_is_an_explicit_budget_controlled_action":
    "Source, workspace and account grants with an approved reference and expiry are required. Access to a channel does not grant ingest or AI processing permission. Live monitoring ingests only; Analyze is an explicit budget-controlled action.",
  "leadDiscovery.qualified_leads_stay_0_until_the_separate_qualification_stage_instagram_references_are_manual_business_links_only_no_direct_or_crawling":
    "Qualified leads require explicit AI qualification and human review. Instagram references remain manual business links; no Direct or crawling.",

  "adSales.status.draft": "Draft",
  "adSales.status.reserved": "Reserved",
  "adSales.status.confirmed": "Confirmed",
  "adSales.status.inProgress": "In progress",
  "adSales.status.completed": "Completed",
  "adSales.status.cancelled": "Cancelled",
  "adSales.placementStatus.draft": "Draft",
  "adSales.placementStatus.reserved": "Reserved",
  "adSales.placementStatus.scheduled": "Scheduled",
  "adSales.placementStatus.published": "Published",
  "adSales.placementStatus.completed": "Completed",
  "adSales.placementStatus.cancelled": "Cancelled",
  "adSales.placementStatus.missed": "Missed",
  "adSales.status.unpaid": "Unpaid",
  "adSales.status.partiallyPaid": "Partially paid",
  "adSales.status.paid": "Paid",
  "adSales.status.overpaid": "Overpaid",
} as const satisfies TranslationCatalog;

export default messages;
