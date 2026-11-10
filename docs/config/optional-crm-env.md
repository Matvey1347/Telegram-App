# Optional advanced CRM environment settings

These settings are deliberately omitted from the starter `.env.example` because a single API deployment works with their defaults. They remain supported for CRM deployments that need Telegram runtime relaying, on-demand media access, or explicitly granted AI processing. Do not enable CRM AI processing or add grants unless the relevant workspaces/contacts have been approved.

| Variable | Default / use |
| --- | --- |
| `CRM_RUNTIME_ENABLED` | Enabled unless explicitly set to `false`. Set false on a relay/secondary API that must not own Telegram sessions. |
| `CRM_RUNTIME_PROXY_URL` | Optional trusted API origin for relaying CRM HTTP/SSE traffic. |
| `CRM_RUNTIME_OWNER_API_PORT` | Optional port profile used when multiple local API processes share one database; only the designated port may own Telegram sessions. |
| `CRM_CHAT_ACTIONS_ENABLED` | Disabled unless explicitly set to `true`; enables authorized CRM Telegram actions. |
| `CRM_CHAT_MEDIA_ENABLED` | Disabled unless explicitly set to `true`; gates authorized on-demand Telegram attachment reads. |
| `INTERNAL_AI_SALES_PROCESSING_ENABLED` | Disabled unless explicitly set to `true`; gates CRM Sales Copilot processing. |
| `INTERNAL_AI_SALES_PROCESSING_GRANTS` | Approved workspace/contact grants for Sales Copilot. Workspace grants cover all CRM conversations in that workspace. Never put API keys here. |
| `INTERNAL_LEAD_DISCOVERY_ENABLED` | Disabled unless explicitly set to `true`; gates lead discovery ingestion and analysis. |
| `INTERNAL_LEAD_DISCOVERY_RECOVERY_MODE` | Optional lead-discovery recovery policy; defaults to `normal`. |
| `INTERNAL_LEAD_DISCOVERY_GRANTS` | Approved workspace/account/channel grants for lead discovery. |
| `INTERNAL_LEAD_QUALIFICATION_ENABLED` | Disabled unless explicitly set to `true`; gates AI lead qualification. |

The shared AI Gateway still uses `INTERNAL_AI_ENABLED` and `INTERNAL_AI_OPENAI_API_KEY` from the main environment template. Workspace grants and provider/model/budget selection remain in Operations > AI.
