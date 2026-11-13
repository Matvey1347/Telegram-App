import type en from "@/i18n/locales/en/ad-sales/common";

const messages = {
  "ads.campaign": "Кампания",
  "ads.performance": "Результаты",
  "ads.actions": "Действия",
  "ads.hypotheses": "Гипотезы",
  "ads.spend": "Расходы",
  "ads.attributed": "Привлечено",
  "ads.joined": "Подписались",
  "ads.pending": "Заявки",
  "ads.peak": "Пик",
  "ads.drop_from_peak": "Снижение от пика",
  "ads.bot_requests": "Заявки через бота",
  "ads.kpi_hit": "KPI достигнут",
  "ads.kpi_ok": "KPI допустимый",
  "ads.kpi_missed": "KPI не достигнут",
  "ads.kpi_unknown": "KPI не определён",
  "ads.open_trend": "Открыть динамику",
  "ads.edit_campaign": "Редактировать кампанию",
  "ads.refresh_invite_link_data": "Обновить данные ссылок",
  "ads.include_in_analytics": "Учитывать в аналитике",
  "ads.exclude_from_analytics": "Исключить из аналитики",
  "ads.delete_campaign": "Удалить кампанию",
  "ads.open_campaign_trend": "Открыть динамику кампании",
  "ads.cpa_is_inside_target_kpi_range": "Стоимость привлечения в целевом диапазоне KPI.",
  "ads.cpa_is_inside_acceptable_kpi_range": "Стоимость привлечения в допустимом диапазоне KPI.",
  "ads.cpa_is_inside_stop_kpi_range": "Стоимость привлечения в стоп-диапазоне KPI.",
  "ads.kpi_range_or_enough_cpa_data_is_missing": "Не задан диапазон KPI или недостаточно данных.",

  "ads.filters": "Фильтры",
  "ads.hide_filters": "Скрыть фильтры",
  "ads.section_campaigns": "Рекламные кампании",
  "ads.section_hypotheses": "Гипотезы",
  "ads.section_promo": "Промо",
  "ads.section_mutual": "Взаимопиар",
  "ads.section_own": "Свои каналы",
  "ads.channel_source": "Источник каналов",
  "ads.network": "Сеть",
  "ads.channels": "Каналы",
  "ads.choose_network": "Выберите сеть",
  "ads.all_channels": "Все каналы",
  "ads.search": "Поиск",
  "ads.period": "Период",
  "ads.choose_period": "Выберите период",
  "ads.campaign_search": "Кампания, источник, канал",
  "ads.promo_search": "Промо, текст, канал",
  "ads.hypothesis_search": "Гипотеза",
  "ads.sort_by": "Сортировать кампании по",
  "ads.sort_date": "Дате",
  "ads.sort_spend": "Расходам",
  "ads.sort_joined": "Подпискам",
  "ads.create_campaign": "Создать кампанию",
  "ads.create_hypothesis": "Создать гипотезу",
  "ads.create_promo": "Создать промо",
  "ads.loading": "Загрузка результатов…",
  "ads.campaigns_title": "Рекламные кампании",
  "ads.campaigns_subtitle": "Планируйте платные размещения, связывайте креативы и пригласительные ссылки и оценивайте привлечённую аудиторию.",
  "ads.hypotheses_title": "Гипотезы",
  "ads.hypotheses_subtitle": "Проверяйте креативные идеи и сравнивайте расходы, подписки, CPA и результаты.",
  "ads.promo_title": "Промо-креативы",
  "ads.promo_subtitle": "Создавайте Telegram-креативы для повторного использования и проверяйте вступительный текст перед запуском кампаний.",
  "leadQualification.a_versioned_review_aid_not_a_calibrated_purchase_probability_or_fraud_verdict":
    "Это версионируемая подсказка для проверки, а не вероятность покупки или заключение о мошенничестве.",
  "leadQualification.ai_discovered_sources_and_prepared_offers":
    "Источники AI-поиска и подготовленные предложения",
  "leadQualification.action_failed_check_current_evidence_identity_source_grant_budget_and_revision_reload_before_retrying":
    "Действие не выполнено. Проверьте доказательства, контакт, разрешения, бюджет и версию. Обновите карточку перед повтором.",
  "leadQualification.all_candidates": "Все кандидаты",
  "leadQualification.apply_candidate_filters": "Применить фильтры",
  "leadQualification.apply_this_human_review_decision_to_the_selected_candidates_no_ai_or_message_is_sent":
    "Применить решение к выбранным кандидатам? AI и отправка сообщений не запускаются.",
  "leadQualification.approve_first_message": "Одобрить первое сообщение",
  "leadQualification.approve_selected": "Одобрить выбранных",
  "leadQualification.approved_message_copied_sending_remains_a_separate_manual_action":
    "Одобренный текст скопирован. Отправка остаётся отдельным ручным действием.",
  "leadQualification.back_to_candidates": "Назад к кандидатам",
  "leadQualification.bulk_review_failed_reload_stale_or_inaccessible_candidates_and_review_again":
    "Массовая проверка не выполнена. Обновите устаревших или недоступных кандидатов.",
  "leadQualification.bulk_review_never_qualifies_or_generates_ai_messages":
    "Массовая проверка не запускает квалификацию и не создаёт AI-сообщения.",
  "leadQualification.cancel": "Отмена",
  "leadQualification.candidate_details": "Информация о кандидате",
  "leadQualification.candidate_draft_language": "Язык предложения кандидату",
  "leadQualification.candidate_draft_tone": "Тон предложения кандидату",
  "leadQualification.choose_real_products_packages":
    "Выбрать реальные продукты / пакеты",
  "leadQualification.confirm_bulk_review": "Подтвердите массовую проверку",
  "leadQualification.confirm_qualified": "Подтвердить соответствие",
  "leadQualification.confirm_selected_review": "Подтвердить проверку выбранных",
  "leadQualification.copy_approved_message": "Копировать одобренный текст",
  "leadQualification.copy_blocked_reload_current_source_contact_and_approval_state":
    "Копирование недоступно. Обновите состояние источника, контакта и одобрения.",
  "leadQualification.discard": "Отменить черновик",
  "leadQualification.evidence_not_linked": "Материалы не связаны",
  "leadQualification.evidence_quality": "Качество доказательств",
  "leadQualification.expires": "Действует до",
  "leadQualification.explain_score_factors": "Из чего складывается оценка",
  "leadQualification.generate_first_offer": "Подготовить первое предложение",
  "leadQualification.state_high_priority": "Высокий приоритет",
  "leadQualification.human_decision": "Решение менеджера",
  "leadQualification.i_reviewed_the_high_risk_evidence_and_take_responsibility_for_this_separate_decision":
    "Я проверил доказательства высокого риска и принимаю отдельное решение.",
  "leadQualification.insufficient_evidence": "Недостаточно доказательств",
  "leadQualification.state_linked": "Связаны с CRM",
  "leadQualification.state_low_relevance": "Низкая релевантность",
  "leadQualification.language": "Язык",
  "leadQualification.lead_workflow_filters": "Фильтры очереди лидов",
  "leadQualification.linked_evidence_unavailable_check_current_crm_and_lead_permissions":
    "Связанные материалы недоступны. Проверьте права CRM и поиска лидов.",
  "leadQualification.load_more_candidates": "Ещё кандидаты",
  "leadQualification.load_more_products": "Ещё продукты",
  "leadQualification.loading_products": "Загрузка продуктов…",
  "leadQualification.loading_qualification": "Загрузка квалификации…",
  "leadQualification.low_relevance": "Низкая релевантность",
  "leadQualification.manager_qualification_decision":
    "Решение менеджера по квалификации",
  "leadQualification.missing_information": "Недостающие сведения",
  "leadQualification.more_acquisition_records_exist_use_the_review_queue_for_the_remaining_candidates":
    "Есть другие связанные записи. Откройте очередь проверки для остальных кандидатов.",
  "leadQualification.state_needs_review": "Нужна проверка",
  "leadQualification.state_new": "Новые",
  "leadQualification.needs_review": "Нужна проверка",
  "leadQualification.no_conversation_is_created_here_candidate_approval_does_not_authorize_a_telegram_send":
    "Переписка здесь не создаётся. Одобрение кандидата не разрешает отправку в Telegram.",
  "leadQualification.no_linked_discovery_evidence":
    "Связанных материалов Discovery нет.",
  "leadQualification.no_qualification_yet_confirm_the_business_contact_and_inspect_evidence_first":
    "Квалификации пока нет. Сначала подтвердите деловой контакт и проверьте материалы.",
  "leadQualification.no_usable_qualification_result_yet_unknown_usage_must_be_reconciled_before_another_paid_attempt":
    "Пригодного результата пока нет. Неизвестный расход нужно сверить перед новой платной попыткой.",
  "leadQualification.only_selected_current_products_prove_prices_package_totals_and_audience_claims_need_verified_facts":
    "Цены подтверждаются только актуальными выбранными продуктами. Стоимость пакета и сведения об аудитории требуют проверенных фактов.",
  "leadQualification.overall_priority": "Общий приоритет",
  "leadQualification.personalized_first_offer":
    "Персональное первое предложение",
  "leadQualification.preparation_is_gated_by_current_permissions_evidence_source_policy_and_budget":
    "Подготовка зависит от текущих прав, доказательств, разрешений источника и бюджета.",
  "leadQualification.preparation_unavailable_check_workspace_permissions_and_retry":
    "Подготовка недоступна. Проверьте права рабочего пространства и повторите.",
  "leadQualification.prepared_first_message": "Подготовленное первое сообщение",
  "leadQualification.product_selection_changed_qualify_and_review_this_context_before_generating":
    "Продукты изменились. Квалифицируйте и проверьте новый контекст перед генерацией.",
  "leadQualification.products_unavailable_check_sales_permissions":
    "Продукты недоступны. Проверьте права на продажи.",
  "leadQualification.state_qualified": "Подходят",
  "leadQualification.qualification_and_first_offer":
    "Квалификация и первое предложение",
  "leadQualification.qualification_and_message_generation_are_separate_budgeted_actions_opening_this_card_calls_no_ai":
    "Квалификация и подготовка текста — отдельные действия с бюджетом. Открытие карточки не вызывает AI.",
  "leadQualification.qualify_explicitly_with_ai": "Запустить AI-квалификацию",
  "leadQualification.quote_required": "Нужен расчёт",
  "leadQualification.state_rejected": "Отклонены",
  "leadQualification.state_risk_high": "Высокий риск",
  "leadQualification.state_risk_low": "Низкий риск",
  "leadQualification.state_risk_medium": "Средний риск",
  "leadQualification.state_risk_unknown": "Риск неизвестен",
  "leadQualification.reject_selected": "Отклонить выбранных",
  "leadQualification.relevance": "Релевантность",
  "leadQualification.reload": "Обновить",
  "leadQualification.retry": "Повторить",
  "leadQualification.review_evidence_qualify_explicitly_then_prepare_a_first_offer_no_automatic_generation_rejection_or_outreach":
    "Проверьте материалы, запустите квалификацию и подготовьте предложение. Автоматической генерации, отклонения и рассылки нет.",
  "leadQualification.revision": "Версия",
  "leadQualification.risk_level": "Уровень риска",
  "leadQualification.risk_review_note": "Комментарий к проверке риска",
  "leadQualification.risk_signals_require_human_verification":
    "Факторы риска требуют проверки человеком",
  "leadQualification.state_suspicious": "Есть риски",
  "leadQualification.save_changes": "Сохранить изменения",
  "leadQualification.save_the_edit_then_approve_again_typing_does_not_write_to_the_server":
    "Сохраните правку и одобрите заново. Ввод текста не записывается на сервер.",
  "leadQualification.saving_or_preparing_please_wait_no_automatic_retry":
    "Сохранение или подготовка… Подождите, автоматического повтора нет.",
  "leadQualification.search_candidates": "Поиск кандидатов",
  "leadQualification.select": "Выбрать",
  "leadQualification.select_a_candidate_to_inspect_evidence_and_prepare_an_offer":
    "Выберите кандидата, чтобы проверить материалы и подготовить предложение.",
  "leadQualification.select_no_more_than_20_candidates":
    "Выберите не более 20 кандидатов.",
  "leadQualification.select_products": "Выбрать продукты",
  "leadQualification.selected_products_up_to_5": "Выбранные продукты (до 5)",
  "leadQualification.this_draft_needs_current_evidence_and_approval_no_automatic_retry_or_send":
    "Для черновика нужны актуальные доказательства и одобрение. Автоматического повтора или отправки нет.",
  "leadQualification.tone": "Тон",
  "leadQualification.unknown_niche": "Тематика неизвестна",
  "leadQualification.view_cited_evidence": "Открыть исходный материал",
  "leadQualification.workflow": "Этап",

  "leadDiscovery.lead_discovery": "Поиск рекламодателей",
  "leadDiscovery.sources": "Источники",
  "leadDiscovery.advertisement_feed": "Рекламные материалы",
  "leadDiscovery.review_queue": "Очередь проверки",
  "leadDiscovery.permitted_sources_advertisement_evidence_human_review_existing_crm":
    "Разрешённые источники → рекламные материалы → проверка человеком → существующая CRM.",
  "leadDiscovery.loading_workspace_access":
    "Загрузка прав рабочего пространства…",
  "leadDiscovery.lead_discovery_view_permission_is_required":
    "Для просмотра нужны права на поиск рекламодателей.",
  "leadDiscovery.loading_lead_discovery": "Загрузка поиска рекламодателей…",
  "leadDiscovery.loading_lead_candidates": "Загрузка кандидатов…",
  "leadDiscovery.no_records_match_these_filters":
    "Нет записей по выбранным фильтрам.",
  "leadDiscovery.retry": "Повторить",
  "leadDiscovery.add_source": "Добавить источник",
  "leadDiscovery.add_lead_source": "Добавить источник лидов",
  "leadDiscovery.import_source_list": "Импортировать список источников",
  "leadDiscovery.export_csv": "Экспорт CSV",
  "leadDiscovery.export_xlsx": "Экспорт XLSX",
  "leadDiscovery.export_failed_retry_with_current_access":
    "Экспорт не удался. Проверьте права и повторите.",
  "leadDiscovery.export_contains_the_first_1_000_sources_only":
    "Экспорт содержит только первые 1 000 источников.",
  "leadDiscovery.search_sources": "Поиск источников",
  "leadDiscovery.source_name_or_identifier":
    "Название или идентификатор источника",
  "leadDiscovery.source_status": "Статус источника",
  "leadDiscovery.all_statuses": "Все статусы",
  "leadDiscovery.apply_source_filters": "Применить фильтры источников",
  "leadDiscovery.load_more_sources": "Загрузить ещё источники",
  "leadDiscovery.source_type": "Тип источника",
  "leadDiscovery.telegram_channel": "Telegram-канал",
  "leadDiscovery.manual_material_source": "Ручной источник материалов",
  "leadDiscovery.manual_source_label": "Название ручного источника",
  "leadDiscovery.username_telegram_link_or_supported_identifier":
    "Username, ссылка Telegram или поддерживаемый идентификатор",
  "leadDiscovery.source_title": "Название источника",
  "leadDiscovery.approved_processing_reference":
    "Утверждённое основание обработки",
  "leadDiscovery.i_deliberately_allow_this_own_channel_for_an_approved_use_case":
    "Я намеренно разрешаю собственный канал для утверждённого сценария",
  "leadDiscovery.new_sources_are_reviewed_and_validated_before_monitoring_no_automatic_channel_join_or_ai_analysis":
    "До мониторинга источник проходит проверку. Автоматического вступления в каналы и анализа AI нет.",
  "leadDiscovery.source_could_not_be_added_check_reference_grants_and_access":
    "Источник не добавлен. Проверьте идентификатор, разрешения и доступ.",
  "leadDiscovery.choose_from_an_existing_live_account":
    "Выбрать из уже подключённого аккаунта",
  "leadDiscovery.this_lists_permitted_channels_using_an_existing_connection_it_never_joins_channels_own_channels_require_a_separate_explicit_manual_override":
    "Список разрешённых каналов использует существующее соединение без вступления в каналы. Собственные каналы требуют отдельного явного разрешения.",
  "leadDiscovery.select_a_live_account": "Выберите подключённый аккаунт",
  "leadDiscovery.available_accounts_could_not_be_loaded":
    "Не удалось загрузить доступные аккаунты.",
  "leadDiscovery.no_existing_live_account_is_available_start_the_existing_account_integration_before_requesting_channels":
    "Нет активного соединения. Запустите существующую интеграцию аккаунта перед запросом каналов.",
  "leadDiscovery.choose_source": "Выбрать источник",
  "leadDiscovery.load_more_channels": "Загрузить ещё каналы",
  "leadDiscovery.format": "Формат",
  "leadDiscovery.text_list": "Текстовый список",
  "leadDiscovery.source_list": "Список источников",
  "leadDiscovery.at_most_100_sources_preview_first_imports_never_join_channels_or_enable_monitoring":
    "До 100 источников. Сначала предпросмотр; импорт не включает мониторинг и не вступает в каналы.",
  "leadDiscovery.preview_sources": "Предпросмотр источников",
  "leadDiscovery.import_preview_failed_check_format_and_the_100_source_limit":
    "Предпросмотр не удался. Проверьте формат и лимит 100 источников.",
  "leadDiscovery.import_valid_new_sources":
    "Импортировать новые корректные источники",
  "leadDiscovery.import_failed_existing_sources_remain_unchanged_retry_explicitly":
    "Импорт не удался. Существующие источники не изменились; повторите вручную.",
  "leadDiscovery.validate_access": "Проверить доступ",
  "leadDiscovery.recover_available_updates":
    "Восстановить доступные обновления",
  "leadDiscovery.disable_source": "Отключить источник",
  "leadDiscovery.import_materials": "Импортировать материалы",
  "leadDiscovery.processing_settings": "Основание обработки",
  "leadDiscovery.source_processing_settings": "Настройки обработки источника",
  "leadDiscovery.save_source_settings": "Сохранить настройки источника",
  "leadDiscovery.source_settings_could_not_be_saved":
    "Не удалось сохранить настройки источника.",
  "leadDiscovery.a_reference_does_not_create_a_grant_deployment_reviewed_source_workspace_account_permissions_and_expiry_remain_authoritative":
    "Указание основания не создаёт разрешение. Действуют проверенные серверные разрешения источника, рабочего пространства и аккаунта с ограниченным сроком.",
  "leadDiscovery.action_failed_check_deployment_grants_live_account_source_access_and_limits_no_automatic_join_or_retry_occurs":
    "Действие не выполнено. Проверьте серверные разрешения, активный аккаунт, доступ и лимиты. Автоматического вступления и повтора нет.",
  "leadDiscovery.import_permitted_materials":
    "Импортировать разрешённые материалы",
  "leadDiscovery.up_to_20_text_materials_from_an_approved_source_no_media_downloads_ai_calls_or_messages_are_triggered":
    "До 20 текстовых материалов утверждённого источника. Загрузка медиа, вызовы AI и отправка сообщений не запускаются.",
  "leadDiscovery.external_message_id": "ID исходного сообщения",
  "leadDiscovery.permitted_source_text": "Разрешённый текст источника",
  "leadDiscovery.published_date_utc": "Дата публикации (UTC)",
  "leadDiscovery.time_utc": "Время (UTC)",
  "leadDiscovery.original_message_link_optional":
    "Ссылка на оригинал (необязательно)",
  "leadDiscovery.add_material": "Добавить материал",
  "leadDiscovery.remove_material": "Удалить материал",
  "leadDiscovery.provide_a_valid_message_id_text_and_utc_publication_date_for_every_material":
    "Укажите корректные ID, текст и дату публикации UTC для каждого материала.",
  "leadDiscovery.materials_were_not_imported_check_source_grants_limits_and_original_identities":
    "Материалы не импортированы. Проверьте разрешения источника, лимиты и исходные идентификаторы.",
  "leadDiscovery.classification": "Классификация",
  "leadDiscovery.all_classes": "Все классы",
  "leadDiscovery.evidence_review": "Проверка материала",
  "leadDiscovery.all_reviews": "Все статусы проверки",
  "leadDiscovery.risk_status": "Статус риска",
  "leadDiscovery.all_risk_states": "Все статусы риска",
  "leadDiscovery.apply_feed_filters": "Применить фильтры материалов",
  "leadDiscovery.select_no_more_than_5_materials":
    "Выберите не более 5 материалов.",
  "leadDiscovery.load_more_materials": "Загрузить ещё материалы",
  "leadDiscovery.only_permitted_evidence_is_listed_nothing_is_analyzed_on_page_open_select_up_to_5_materials_for_explicit_budget_controlled_classification_and_contact_extraction":
    "Отображаются разрешённые материалы. При открытии страницы анализ не запускается. Выберите до 5 материалов для явной классификации и извлечения контактов с контролем бюджета.",
  "leadDiscovery.analysis_could_not_complete_check_ai_budgets_permissions_source_ai_grants_and_held_usage_no_automatic_paid_retry_occurs":
    "Анализ не завершён. Проверьте бюджеты AI, права, разрешения источника и AI, а также зарезервированные расходы. Платный запрос не повторяется автоматически.",
  "leadDiscovery.analyze_selection": "Выбор для анализа",
  "leadDiscovery.commercial_intent_is_not_proof_of_paid_placement":
    "Коммерческий характер не доказывает оплату размещения.",
  "leadDiscovery.open_original_reference": "Открыть ссылку на оригинал",
  "leadDiscovery.the_original_is_deleted_unavailable_or_not_linked_saved_evidence_is_not_a_currently_available_original":
    "Оригинал удалён, недоступен или не указан. Сохранённый материал не является доступным сейчас оригиналом.",
  "leadDiscovery.approve_evidence": "Подтвердить материал",
  "leadDiscovery.reject_evidence": "Отклонить материал",
  "leadDiscovery.create_candidate_manually": "Создать кандидата вручную",
  "leadDiscovery.evidence_review_failed_check_current_access_and_state":
    "Проверка материала не удалась. Проверьте текущий доступ и состояние.",
  "leadDiscovery.create_a_candidate_from_evidence":
    "Создать кандидата из материала",
  "leadDiscovery.manual_fallback_uses_this_approved_material_only_no_ai_call_crm_client_or_commercial_conversation_is_created":
    "Ручной сценарий использует только утверждённый материал. AI не вызывается; клиент CRM и коммерческая переписка не создаются.",
  "leadDiscovery.advertiser_project_title": "Название рекламодателя / проекта",
  "leadDiscovery.public_business_contact_type_optional":
    "Тип публичного бизнес-контакта (необязательно)",
  "leadDiscovery.public_contact_value": "Публичный контакт",
  "leadDiscovery.contact_role": "Роль контакта",
  "leadDiscovery.evidence_for_the_contact": "Подтверждение контакта",
  "leadDiscovery.create_review_candidate": "Создать кандидата для проверки",
  "leadDiscovery.candidate_could_not_be_created_confirm_source_eligibility_evidence_approval_and_contact_syntax":
    "Кандидат не создан. Проверьте допуск источника, подтверждение материала и формат контакта.",
  "leadDiscovery.a_channel_link_is_not_automatically_the_advertiser_or_sales_contact_instagram_is_a_manual_business_reference_only":
    "Ссылка на канал не считается автоматически контактом рекламодателя или отдела продаж. Instagram — только бизнес-ссылка для ручного перехода.",
  "leadDiscovery.search_candidates": "Поиск кандидатов",
  "leadDiscovery.candidate_review": "Проверка кандидата",
  "leadDiscovery.apply_candidate_filters": "Применить фильтры кандидатов",
  "leadDiscovery.select_no_more_than_20_candidates":
    "Выберите не более 20 кандидатов.",
  "leadDiscovery.load_more_candidates": "Загрузить ещё кандидатов",
  "leadDiscovery.crm_client_not_linked": "Клиент CRM не связан",
  "leadDiscovery.open_linked_crm_client": "Открыть связанного клиента CRM →",
  "leadDiscovery.candidates_are_review_records_not_conversations_only_a_human_can_approve_evidence_and_create_link_an_existing_crm_client_nothing_is_sent_automatically":
    "Кандидаты — записи для проверки, без переписки. Материалы подтверждает человек; он же создаёт или связывает клиента CRM. Автоматических сообщений нет.",
  "leadDiscovery.bulk_review_failed_reload_stale_or_inaccessible_candidates_and_review_again":
    "Массовая проверка не удалась. Обновите устаревшие или недоступные записи и повторите.",
  "leadDiscovery.reload_details": "Обновить подробности",
  "leadDiscovery.all_linked_sources": "Все связанные источники",
  "leadDiscovery.public_business_contacts": "Публичные бизнес-контакты",
  "leadDiscovery.no_verified_business_contact_was_found":
    "Подтверждённый бизнес-контакт не найден.",
  "leadDiscovery.open_business_reference_manually":
    "Открыть бизнес-ссылку вручную",
  "leadDiscovery.advertisement_evidence": "Рекламные материалы",
  "leadDiscovery.additional_evidence_exists_use_the_bounded_source_feed_to_inspect_remaining_materials_this_detail_view_is_truncated":
    "Есть дополнительные материалы. Откройте ленту источника для дальнейшей проверки; здесь показана ограниченная выборка.",
  "leadDiscovery.review_history": "История проверки",
  "leadDiscovery.no_review_action_yet": "Проверка ещё не проводилась.",
  "leadDiscovery.human_review_crm": "Проверка человеком и CRM",
  "leadDiscovery.confirm_each_public_business_contact_and_its_role_from_evidence_a_destination_link_does_not_prove_ownership_risk_signals_are_not_a_fraud_verdict":
    "Проверьте каждый публичный бизнес-контакт и его роль по материалам. Ссылка назначения не доказывает владение. Признаки риска не являются выводом о мошенничестве.",
  "leadDiscovery.reviewed_risk_status": "Проверенный статус риска",
  "leadDiscovery.approve_candidate": "Подтвердить кандидата",
  "leadDiscovery.reject_candidate": "Отклонить кандидата",
  "leadDiscovery.crm_creation_linking_requires_an_approved_acceptable_candidate_and_a_confirmed_advertiser_or_sales_contact_no_conversation_or_outreach_is_created":
    "Для создания или связи клиента нужны подтверждённый допустимый кандидат и проверенный контакт рекламодателя или продаж. Переписка и рассылка не создаются.",
  "leadDiscovery.crm_client_name": "Имя клиента CRM",
  "leadDiscovery.create_crm_client": "Создать клиента CRM",
  "leadDiscovery.link_existing_crm_client": "Связать существующего клиента CRM",
  "leadDiscovery.confirm_client_link": "Подтвердить связь с клиентом",
  "leadDiscovery.possible_aliases_manual_decision_only":
    "Возможные дубликаты — решение только вручную",
  "leadDiscovery.choose_a_verified_duplicate": "Выберите проверенный дубликат",
  "leadDiscovery.i_verified_these_records_represent_the_same_advertiser":
    "Я проверил, что записи относятся к одному рекламодателю",
  "leadDiscovery.merge_reviewed_duplicate": "Объединить проверенный дубликат",
  "leadDiscovery.review_failed_permissions_revision_evidence_or_crm_linkage_may_have_changed_reload_details_before_retrying":
    "Проверка не удалась. Права, версия, материалы или связь CRM могли измениться. Обновите подробности перед повтором.",
  "leadDiscovery.search_clients": "Найти клиентов",
  "leadDiscovery.client_name_or_business_identifier":
    "Имя клиента или бизнес-идентификатор",
  "leadDiscovery.choose_an_existing_client": "Выберите существующего клиента",
  "leadDiscovery.selected_client": "Выбранный клиент",
  "leadDiscovery.load_more_clients": "Загрузить ещё клиентов",
  "leadDiscovery.crm_clients_could_not_be_loaded_check_crm_view_permissions":
    "Клиенты CRM не загружены. Проверьте права просмотра CRM.",
  "leadDiscovery.all_sources": "Все источники",
  "leadDiscovery.selected_source": "Выбранный источник",
  "leadDiscovery.load_source_choices": "Загрузить варианты источников",
  "leadDiscovery.source_choices_could_not_be_loaded":
    "Не удалось загрузить варианты источников.",
  "leadDiscovery.open_lead_discovery": "Открыть поиск рекламодателей →",
  "leadDiscovery.lead_discovery_could_not_be_loaded_manual_inbox_conversations_remain_available":
    "Поиск рекламодателей недоступен. Обычные переписки Inbox остаются доступными.",
  "leadDiscovery.no_ads_30d_requires_proven_continuous_coverage_never_source_age_missing_access_missing_data_and_low_yield_are_distinct_states_sources_are_separate_from_our_advertising_inventory":
    "NO_ADS_30D требует доказанного непрерывного покрытия, а не возраста источника. Отсутствие доступа, данных и низкая отдача различаются. Источники не смешиваются с нашим рекламным инвентарём.",
  "leadDiscovery.source_workspace_and_account_grants_with_an_approved_reference_and_expiry_are_required_access_to_a_channel_does_not_grant_ingest_or_ai_processing_permission_live_monitoring_ingests_only_analyze_is_an_explicit_budget_controlled_action":
    "Нужны разрешения источника, рабочего пространства и аккаунта с утверждённым основанием и сроком. Доступ к каналу не разрешает сбор или передачу AI. Мониторинг только принимает материалы; анализ запускается явно с контролем бюджета.",
  "leadDiscovery.qualified_leads_stay_0_until_the_separate_qualification_stage_instagram_references_are_manual_business_links_only_no_direct_or_crawling":
    "Квалификация требует отдельного запуска AI и решения менеджера. Instagram — только бизнес-ссылки для ручного перехода, без Direct и обхода сайтов.",

  "adSales.status.draft": "Черновик",
  "adSales.status.reserved": "Зарезервировано",
  "adSales.status.confirmed": "Подтверждено",
  "adSales.status.inProgress": "В работе",
  "adSales.status.completed": "Завершено",
  "adSales.status.cancelled": "Отменено",
  "adSales.placementStatus.draft": "Черновик",
  "adSales.placementStatus.reserved": "Зарезервировано",
  "adSales.placementStatus.scheduled": "Запланировано",
  "adSales.placementStatus.published": "Опубликовано",
  "adSales.placementStatus.completed": "Завершено",
  "adSales.placementStatus.cancelled": "Отменено",
  "adSales.placementStatus.missed": "Пропущено",
  "adSales.status.unpaid": "Не оплачено",
  "adSales.status.partiallyPaid": "Оплачено частично",
  "adSales.status.paid": "Оплачено",
  "adSales.status.overpaid": "Переплата",
} as const satisfies Record<keyof typeof en, string>;

export default messages;
