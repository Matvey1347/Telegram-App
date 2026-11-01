-- Synthetic constraint and existing-data checks; all probe writes roll back.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "TelegramAdvertiserContact" WHERE id='crm_migration_legacy_other' AND type='OTHER' AND value='@synthetic_profile' AND "identityState"='ACTIVE' AND "ownershipConfirmedAt" IS NULL) THEN RAISE EXCEPTION 'Legacy OTHER identity changed during additive migrations'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='TelegramCrmChatOperation_unknown_target_key' AND indexdef LIKE '%WHERE%UNKNOWN%') THEN RAISE EXCEPTION 'Pending target partial index missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='TelegramAdvertiserActivity_instagram_manual_retention_idx' AND indexdef LIKE '%WHERE%INSTAGRAM%') THEN RAISE EXCEPTION 'Instagram retention partial index missing'; END IF;
END $$;
INSERT INTO "Workspace" (id,name,"updatedAt") VALUES ('crm_migration_other_workspace','Synthetic other workspace',NOW());
DO $$ BEGIN
 BEGIN
  INSERT INTO "TelegramCrmChatOperation" (id,"workspaceId","operationId","actorUserId","conversationId","mtprotoAccountId",kind,"requestFingerprint",request,"updatedAt") VALUES ('cross_scope','crm_migration_other_workspace','cross_scope','synthetic_actor','synthetic_conversation','crm_migration_account','EDIT','synthetic','{}',NOW());
  RAISE EXCEPTION 'Cross-workspace account receipt unexpectedly accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
INSERT INTO "TelegramCrmChatOperation" (id,"workspaceId","operationId","actorUserId","conversationId","mtprotoAccountId","targetMessageId",kind,"requestFingerprint",request,"updatedAt") VALUES ('valid_operation','cmptsyujx0001flritxdrq84b','valid_operation','synthetic_actor','synthetic_conversation','crm_migration_account','synthetic_target','EDIT','synthetic','{}',NOW());
DO $$ BEGIN
 BEGIN
  INSERT INTO "TelegramCrmChatOperation" SELECT 'duplicate_operation',"workspaceId",'valid_operation',"actorUserId","conversationId","mtprotoAccountId",NULL,kind,"requestFingerprint",status,request,result,"createdAt","updatedAt" FROM "TelegramCrmChatOperation" WHERE id='valid_operation';
  RAISE EXCEPTION 'Duplicate operation unexpectedly accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO "TelegramCrmChatOperation" SELECT 'duplicate_target',"workspaceId",'different_operation',"actorUserId","conversationId","mtprotoAccountId","targetMessageId",kind,"requestFingerprint",status,request,result,"createdAt","updatedAt" FROM "TelegramCrmChatOperation" WHERE id='valid_operation';
  RAISE EXCEPTION 'Duplicate pending target unexpectedly accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
INSERT INTO "TelegramCrmDeletedMessage" ("mtprotoAccountId","telegramMessageId","workspaceId") VALUES ('crm_migration_account',123,'cmptsyujx0001flritxdrq84b');
DELETE FROM "TelegramUserAccountIntegration" WHERE id='crm_migration_account';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "TelegramCrmChatOperation" WHERE id='valid_operation') OR EXISTS (SELECT 1 FROM "TelegramCrmDeletedMessage" WHERE "mtprotoAccountId"='crm_migration_account') THEN RAISE EXCEPTION 'Account lifecycle cascade failed'; END IF;
END $$;
ROLLBACK;
