-- Read-state reconciliation addresses grouped CRM notifications by workspace,
-- type and Contact/Conversation source key. Keep this bounded lookup off the
-- recipient-oriented list index as notification history grows.
CREATE INDEX "OperationsNotification_workspace_type_source_idx"
  ON "OperationsNotification"("workspaceId", "type", "sourceKey");
