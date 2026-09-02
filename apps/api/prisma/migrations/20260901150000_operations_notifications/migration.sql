-- Generic in-app and Web Push notification storage. This migration only adds
-- schema and fail-closed permissions: it creates no notifications, messages,
-- conversations, automation executions, or scheduled work.

CREATE TYPE "OperationsNotificationType" AS ENUM (
  'CRM_MESSAGE_RECEIVED',
  'CRM_FOLLOW_UP_DUE',
  'CRM_AUTOMATION_BLOCKED',
  'CRM_PLACEMENT_FAILURE'
);

CREATE TYPE "OperationsNotificationPriority" AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH'
);

CREATE TABLE "OperationsNotification" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "recipientMemberId" TEXT NOT NULL,
  "type" "OperationsNotificationType" NOT NULL,
  "priority" "OperationsNotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "sourceKey" TEXT NOT NULL,
  "copyKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "targetUrl" TEXT NOT NULL,
  "requiredPermissionKey" TEXT,
  "ownPermissionKey" TEXT,
  "anyPermissionKey" TEXT,
  "visibilityMemberId" TEXT,
  "visibilityResourceKey" TEXT,
  "readAt" TIMESTAMP(3),
  "deliverAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "pushAttemptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationsNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationsPushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationsPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationsNotificationPreference" (
  "workspaceId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "webPushEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationsNotificationPreference_pkey"
    PRIMARY KEY ("workspaceId", "memberId")
);

CREATE UNIQUE INDEX "OperationsNotification_workspace_recipient_type_source_key"
  ON "OperationsNotification"("workspaceId", "recipientMemberId", "type", "sourceKey");
CREATE INDEX "OperationsNotification_recipient_list_idx"
  ON "OperationsNotification"("workspaceId", "recipientMemberId", "createdAt", "id");
CREATE INDEX "OperationsNotification_publication_due_idx"
  ON "OperationsNotification"("deliverAt", "id")
  WHERE "publishedAt" IS NULL;
CREATE INDEX "OperationsNotification_unread_idx"
  ON "OperationsNotification"("workspaceId", "recipientMemberId", "createdAt" DESC, "id" DESC)
  WHERE "readAt" IS NULL AND "publishedAt" IS NOT NULL;
CREATE INDEX "OperationsNotification_expiry_idx"
  ON "OperationsNotification"("expiresAt", "id");
CREATE INDEX "OperationsNotification_pending_source_idx"
  ON "OperationsNotification"("workspaceId", "type", "sourceKey")
  WHERE "publishedAt" IS NULL;
CREATE INDEX "OperationsNotification_visibility_resource_idx"
  ON "OperationsNotification"("workspaceId", "visibilityResourceKey", "publishedAt");
CREATE UNIQUE INDEX "OperationsPushSubscription_endpoint_key"
  ON "OperationsPushSubscription"("endpoint");
CREATE INDEX "OperationsPushSubscription_user_active_idx"
  ON "OperationsPushSubscription"("userId", "active", "id");
CREATE UNIQUE INDEX "OperationsNotificationPreference_member_workspace_key"
  ON "OperationsNotificationPreference"("memberId", "workspaceId");

ALTER TABLE "OperationsNotification"
  ADD CONSTRAINT "OperationsNotification_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationsNotification"
  ADD CONSTRAINT "OperationsNotification_recipient_workspace_fkey"
  FOREIGN KEY ("recipientMemberId", "workspaceId")
  REFERENCES "WorkspaceMember"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationsPushSubscription"
  ADD CONSTRAINT "OperationsPushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationsNotificationPreference"
  ADD CONSTRAINT "OperationsNotificationPreference_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationsNotificationPreference"
  ADD CONSTRAINT "OperationsNotificationPreference_member_workspace_fkey"
  FOREIGN KEY ("memberId", "workspaceId")
  REFERENCES "WorkspaceMember"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- DENYLIST roles inherit absent permissions. Keep notification/deep-link
-- access off for every existing non-owner DENYLIST role; owners keep the
-- immutable owner bypass and ALLOWLIST roles remain off until granted.
INSERT INTO "WorkspaceRolePermission" (
  "id", "roleId", "permissionKey", "effect"
)
SELECT
  'wrp_' || MD5(r."id" || ':operations.notifications'),
  r."id",
  'operations.notifications',
  'DENY'::"WorkspaceRolePermissionEffect"
FROM "WorkspaceRoleDefinition" r
WHERE r."mode" = 'DENYLIST'
  AND r."systemKey" IS DISTINCT FROM 'OWNER'
ON CONFLICT ("roleId", "permissionKey")
DO UPDATE SET "effect" = EXCLUDED."effect";
