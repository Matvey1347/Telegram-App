-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'MEDIA_BUYER', 'member');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "CurrencyDisplayMode" AS ENUM ('code', 'symbol');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('planned', 'active', 'finished', 'cancelled', 'archived');

-- CreateEnum
CREATE TYPE "PromoStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "TelegramUserAccountStatus" AS ENUM ('pending', 'needs_code', 'needs_password', 'connected', 'error', 'disabled');

-- CreateEnum
CREATE TYPE "TelegramSourceType" AS ENUM ('BOT', 'MTPROTO');

-- CreateEnum
CREATE TYPE "TelegramChannelSourceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TelegramChannelDataType" AS ENUM ('CHANNEL_INFO', 'POSTS', 'INVITE_LINKS', 'STATS', 'MEMBERS', 'REACTIONS', 'VIEWS', 'OTHER');

-- CreateEnum
CREATE TYPE "TelegramChannelAccessMode" AS ENUM ('PUBLIC', 'PRIVATE', 'PRIVATE_INVITE', 'PRIVATE_JOIN_REQUEST', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TelegramChannelAcquisitionType" AS ENUM ('CREATED', 'PURCHASED');

-- CreateEnum
CREATE TYPE "TelegramDataSourceStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TelegramInviteLinkCreatorMatchSource" AS ENUM ('TELEGRAM_USER_ID', 'MTPROTO_USERNAME', 'MEMBER_USERNAME', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "AdvertisingSourceType" AS ENUM ('telegram_channel', 'instagram', 'facebook', 'website', 'direct', 'other');

-- CreateEnum
CREATE TYPE "IconType" AS ENUM ('emoji', 'image');

-- CreateEnum
CREATE TYPE "TelegramChannelAdAnalysisStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED', 'WATCH_LATER', 'BLACKLIST', 'TESTED');

-- CreateEnum
CREATE TYPE "TelegramManagedPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "TelegramManagedPostRemoteStatus" AS ENUM ('NONE', 'SCHEDULED', 'PUBLISHED', 'BROKEN', 'MISSING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TelegramManagedPostOrigin" AS ENUM ('SYSTEM', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "TelegramManagedPostIdVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'MISMATCH', 'MISSING');

-- CreateEnum
CREATE TYPE "TelegramManagedPostLinkSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "TelegramAdPricingMode" AS ENUM ('CPM', 'FIXED', 'MANUAL');

-- CreateEnum
CREATE TYPE "TelegramAdSlotStrategy" AS ENUM ('BEFORE_ORGANIC_POST', 'FIXED_TIMES', 'MANUAL');

-- CreateEnum
CREATE TYPE "TelegramAdSaleStatus" AS ENUM ('DRAFT', 'RESERVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TelegramAdPlacementStatus" AS ENUM ('DRAFT', 'RESERVED', 'SCHEDULED', 'PUBLISHED', 'COMPLETED', 'CANCELLED', 'MISSED');

-- CreateEnum
CREATE TYPE "TelegramAdSalePaymentStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserStatus" AS ENUM ('LEAD', 'ACTIVE', 'INACTIVE', 'LOST', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserLifecycleStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CUSTOMER', 'REPEAT_CUSTOMER', 'REACTIVATION', 'CHURNED');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserContactType" AS ENUM ('TELEGRAM_USERNAME', 'TELEGRAM_USER_ID', 'PHONE', 'EMAIL', 'WEBSITE', 'OTHER');

-- CreateEnum
CREATE TYPE "TelegramAdCrmDealStage" AS ENUM ('NEW_LEAD', 'CONTACTED', 'NEED_IDENTIFIED', 'OFFER_PREPARED', 'OFFER_SENT', 'NEGOTIATION', 'SLOT_RESERVED', 'WAITING_PAYMENT', 'PAID', 'SCHEDULED', 'PUBLISHED', 'COMPLETED', 'LOST');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserActivityType" AS ENUM ('ADVERTISER_CREATED', 'CONTACT_ADDED', 'NOTE_ADDED', 'MANUAL_CONTACT', 'OUTREACH_PLANNED', 'OUTREACH_COMPLETED', 'CLIENT_REPLIED', 'OFFER_SENT', 'SALE_CREATED', 'SALE_STAGE_CHANGED', 'SLOT_RESERVED', 'PAYMENT_RECORDED', 'PLACEMENT_SCHEDULED', 'PLACEMENT_PUBLISHED', 'PLACEMENT_COMPLETED', 'FOLLOW_UP_CREATED', 'FOLLOW_UP_COMPLETED', 'FOLLOW_UP_SKIPPED', 'CLIENT_DECLINED', 'CLIENT_REQUESTED_LATER_CONTACT', 'CLIENT_REACTIVATED', 'ADVERTISER_MERGED', 'OWNER_CHANGED', 'STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserTaskType" AS ENUM ('FOLLOW_UP', 'PAYMENT_FOLLOW_UP', 'REQUEST_FEEDBACK', 'OFFER_FREE_SLOT', 'REACTIVATION', 'PREPARE_OFFER', 'MANUAL');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TelegramAdCrmOwnerMode" AS ENUM ('SALE_ASSIGNEE', 'ADVERTISER_OWNER', 'WORKSPACE_DEFAULT');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserAutomationEventType" AS ENUM ('PLACEMENT_COMPLETED', 'PLACEMENT_PUBLISHED', 'SALE_COMPLETED', 'PAYMENT_OVERDUE', 'ADVERTISER_INACTIVE', 'FREE_SLOT_AVAILABLE', 'HIGH_PERFORMING_PLACEMENT', 'CLIENT_REQUESTED_LATER_CONTACT');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserAutomationActionType" AS ENUM ('CREATE_FOLLOW_UP_TASK', 'CREATE_PAYMENT_TASK', 'CREATE_FEEDBACK_TASK', 'CREATE_REACTIVATION_TASK', 'CREATE_FREE_SLOT_SUGGESTION');

-- CreateEnum
CREATE TYPE "TelegramAdvertiserAutomationExecutionStatus" AS ENUM ('CREATED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdCampaignAdmissionBatchStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AdCampaignAdmissionDetectionMode" AS ENUM ('EXACT_DELTA', 'BOOTSTRAPPED_CUMULATIVE');

-- CreateEnum
CREATE TYPE "AdCampaignAdmissionTimeBoundarySource" AS ENUM ('CAMPAIGN_ACTUAL_START', 'CAMPAIGN_START', 'INVITE_LINK_CREATED', 'AUDIENCE_SNAPSHOT', 'FIRST_INVITE_SNAPSHOT');

-- CreateEnum
CREATE TYPE "AdCampaignAdmissionBaselineMethod" AS ENUM ('PRE_ADMISSION', 'EARLIEST_OBSERVED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AdCampaignAdmissionDataQuality" AS ENUM ('GOOD', 'PARTIAL', 'INSUFFICIENT', 'SUSPICIOUS');

-- CreateEnum
CREATE TYPE "TelegramAdPlacementAdvertiserResultSource" AS ENUM ('MANUAL', 'ADVERTISER_REPORTED', 'TRACKED');

-- CreateEnum
CREATE TYPE "ApplicationLogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

-- CreateEnum
CREATE TYPE "ApplicationLogKind" AS ENUM ('http', 'application', 'integration', 'cron', 'client', 'audit');

-- CreateEnum
CREATE TYPE "ScheduledTaskScope" AS ENUM ('WORKSPACE_OPERATION', 'SYSTEM_MAINTENANCE');

-- CreateEnum
CREATE TYPE "ScheduledTaskTrigger" AS ENUM ('SCHEDULE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScheduledTaskRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ScheduledTaskNotificationChannel" AS ENUM ('SYSTEM_TELEGRAM_BOT');

-- CreateEnum
CREATE TYPE "TelegramBotApplicationType" AS ENUM ('NONE', 'GREETER', 'FINANCE');

-- CreateEnum
CREATE TYPE "TelegramBotRuntimeStatus" AS ENUM ('DISABLED', 'STARTING', 'ACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "TelegramBotWebhookStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'ERROR');

-- CreateEnum
CREATE TYPE "TelegramBotUpdateStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'DUPLICATE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TelegramBotDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'RETRY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TelegramBotDeliveryType" AS ENUM ('SEND_MESSAGE');

-- CreateEnum
CREATE TYPE "GreeterCaptchaType" AS ENUM ('BUTTON_CONFIRM', 'SIMPLE_CHOICE');

-- CreateEnum
CREATE TYPE "GreeterFailureBehavior" AS ENUM ('KEEP_PENDING', 'DECLINE');

-- CreateEnum
CREATE TYPE "GreeterJoinRequestStatus" AS ENUM ('PENDING_CAPTCHA', 'APPROVED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GreeterUserState" AS ENUM ('ALIVE', 'BLOCKED', 'DID_NOT_INTERACT');

-- CreateEnum
CREATE TYPE "TelegramSystemBotFinanceDraftStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "TelegramSystemBotFinanceDraftKind" AS ENUM ('TRANSACTION', 'TRANSFER');

-- CreateEnum
CREATE TYPE "GreeterSequenceTrigger" AS ENUM ('AFTER_START', 'AFTER_CAPTCHA_SUCCESS');

-- CreateEnum
CREATE TYPE "GreeterSequenceVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "GreeterAutomationEnvironment" AS ENUM ('PRODUCTION', 'TEST');

-- CreateEnum
CREATE TYPE "GreeterStepExecutionStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GreeterBroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GreeterBroadcastAudience" AS ENUM ('ALL_ALIVE', 'CHANNEL', 'USER_STATE');

-- CreateEnum
CREATE TYPE "GreeterBroadcastRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'FAILED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceAccountType" AS ENUM ('CASH', 'CARD', 'SAVINGS', 'OTHER');

-- CreateEnum
CREATE TYPE "FinanceTransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceTransactionSource" AS ENUM ('CHAT', 'MINI_APP', 'AI', 'RECEIPT');

-- CreateEnum
CREATE TYPE "FinanceProposalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FinanceLimitPeriod" AS ENUM ('MONTH');

-- CreateEnum
CREATE TYPE "FinanceReminderRecurrence" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "FinanceAiProvider" AS ENUM ('OPENAI');

-- CreateEnum
CREATE TYPE "FinanceAiConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'INVALID');

-- CreateEnum
CREATE TYPE "BotBillingProvider" AS ENUM ('STRIPE', 'TELEGRAM_STARS');

-- CreateEnum
CREATE TYPE "BotBillingProviderMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "BotBillingConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'INVALID');

-- CreateEnum
CREATE TYPE "BotBillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "BotSubscriptionSource" AS ENUM ('STRIPE', 'TELEGRAM_STARS', 'MANUAL', 'GIFT');

-- CreateEnum
CREATE TYPE "BotSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "BotSubscriptionGrantSource" AS ENUM ('MANUAL', 'GIFT');

-- CreateEnum
CREATE TYPE "BotBillingEventType" AS ENUM ('CHECKOUT_COMPLETED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELED', 'GRANT_CREATED', 'GRANT_REVOKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "seedKey" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "editorShortcuts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Warsaw',
    "primaryCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "secondaryCurrency" VARCHAR(3) NOT NULL DEFAULT 'UAH',
    "tertiaryCurrency" VARCHAR(3) NOT NULL DEFAULT 'UAH',
    "currencyDisplayMode" "CurrencyDisplayMode" NOT NULL DEFAULT 'code',
    "avatarIconId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "emoji" TEXT,
    "iconId" TEXT,
    "assignedMemberId" TEXT,
    "telegramChannelId" TEXT,
    "telegramChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSalesTextTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "iconId" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "channelLineTemplate" TEXT NOT NULL,
    "channelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selections" JSONB NOT NULL,
    "discountMode" TEXT NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSalesTextTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUserAccountIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assignedMemberId" TEXT,
    "createdByUserId" TEXT,
    "label" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "apiHashEncrypted" TEXT NOT NULL,
    "apiHashIv" TEXT NOT NULL,
    "apiHashAuthTag" TEXT NOT NULL,
    "phoneMasked" TEXT,
    "phoneEncrypted" TEXT,
    "phoneIv" TEXT,
    "phoneAuthTag" TEXT,
    "telegramUserId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "photoUrl" TEXT,
    "nameColor" INTEGER,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "premiumCheckedAt" TIMESTAMP(3),
    "captionLengthMax" INTEGER NOT NULL DEFAULT 1024,
    "messageLengthMax" INTEGER NOT NULL DEFAULT 4096,
    "premiumCapabilities" JSONB,
    "status" "TelegramUserAccountStatus" NOT NULL DEFAULT 'pending',
    "lastErrorMessage" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionEncrypted" TEXT,
    "sessionIv" TEXT,
    "sessionAuthTag" TEXT,
    "loginPhoneCodeHash" TEXT,
    "loginTempSessionEncrypted" TEXT,
    "loginTempSessionIv" TEXT,
    "loginTempSessionAuthTag" TEXT,
    "loginStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUserAccountIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelAdminLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "telegramUserAccountIntegrationId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mtproto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelAdminLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelSourceAccess" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceType" "TelegramSourceType" NOT NULL,
    "role" "TelegramChannelSourceRole" NOT NULL DEFAULT 'UNKNOWN',
    "canPostMessages" BOOLEAN NOT NULL DEFAULT false,
    "canEditMessages" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteMessages" BOOLEAN NOT NULL DEFAULT false,
    "canInviteUsers" BOOLEAN NOT NULL DEFAULT false,
    "canManageInviteLinks" BOOLEAN NOT NULL DEFAULT false,
    "canViewStats" BOOLEAN NOT NULL DEFAULT false,
    "rawPermissions" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelSourceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelDataSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceType" "TelegramSourceType" NOT NULL,
    "dataType" "TelegramChannelDataType" NOT NULL,
    "status" "TelegramDataSourceStatus" NOT NULL DEFAULT 'SUCCESS',
    "sourceDisplayName" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelDataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'admin',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "avatarIconId" TEXT,
    "telegramUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "initialBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "iconId" TEXT,
    "assignedMemberId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "telegramChannelId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountInPrimaryCurrency" DECIMAL(65,30) NOT NULL,
    "exchangeRateToPrimary" DECIMAL(65,30) NOT NULL,
    "category" TEXT NOT NULL,
    "categoryId" TEXT,
    "memberId" TEXT,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "adCampaignId" TEXT,
    "createdByUserId" TEXT,
    "iconId" TEXT,
    "assignedMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCategory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "key" TEXT,
    "iconId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceMemberId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountInPrimaryCurrency" DECIMAL(65,30) NOT NULL,
    "exchangeRateToPrimary" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "assignedMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "fromAmount" DECIMAL(65,30) NOT NULL,
    "fromCurrency" VARCHAR(3) NOT NULL,
    "toAmount" DECIMAL(65,30) NOT NULL,
    "toCurrency" VARCHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(65,30),
    "expectedToAmount" DECIMAL(65,30),
    "transferLossAmount" DECIMAL(65,30),
    "transferLossCurrency" VARCHAR(3),
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT,
    "assignedMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT,
    "telegramChatId" TEXT,
    "telegramAccessHash" TEXT,
    "accessMode" "TelegramChannelAccessMode" NOT NULL DEFAULT 'UNKNOWN',
    "requiresJoinRequest" BOOLEAN NOT NULL DEFAULT false,
    "lastEntityResolvedAt" TIMESTAMP(3),
    "inviteLink" TEXT,
    "description" TEXT,
    "language" TEXT,
    "niche" TEXT,
    "currentSubscribersCount" INTEGER,
    "seedSubscribersCount" INTEGER NOT NULL DEFAULT 0,
    "activeSubscribersWindow" INTEGER NOT NULL DEFAULT 5,
    "knownFakeSubscribersCount" INTEGER NOT NULL DEFAULT 0,
    "ownViewsPerPost" INTEGER NOT NULL DEFAULT 0,
    "ownReactionsPerPost" INTEGER NOT NULL DEFAULT 0,
    "adBaseCpm" DECIMAL(65,30),
    "adBaseCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "subscriberBaseQuality" TEXT NOT NULL DEFAULT 'normal',
    "dataQualityNotes" TEXT,
    "targetCpaFrom" DECIMAL(65,30),
    "targetCpa" DECIMAL(65,30),
    "acceptableCpaFrom" DECIMAL(65,30),
    "acceptableCpa" DECIMAL(65,30),
    "stopCpaFrom" DECIMAL(65,30),
    "stopCpa" DECIMAL(65,30),
    "acquisitionType" "TelegramChannelAcquisitionType" NOT NULL DEFAULT 'CREATED',
    "postsSyncFrom" TIMESTAMP(3),
    "inviteLinksSyncFrom" TIMESTAMP(3),
    "purchaseTransactionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "assignedMemberId" TEXT,
    "createdByUserId" TEXT,
    "photoSmallFileId" TEXT,
    "photoBigFileId" TEXT,
    "photoUrl" TEXT,
    "sourceType" TEXT DEFAULT 'telegram',
    "lastPublicSyncedAt" TIMESTAMP(3),
    "syncIncludePublicInfo" BOOLEAN NOT NULL DEFAULT true,
    "syncIncludeInviteLinks" BOOLEAN NOT NULL DEFAULT true,
    "syncIncludeHistoricalPosts" BOOLEAN NOT NULL DEFAULT true,
    "syncIncludePostMetrics" BOOLEAN NOT NULL DEFAULT true,
    "syncIncludeOlderPosts" BOOLEAN NOT NULL DEFAULT true,
    "syncIncludeChannelStats" BOOLEAN NOT NULL DEFAULT true,
    "syncIncludeManagedPosts" BOOLEAN NOT NULL DEFAULT true,
    "syncIncludeAudienceSnapshot" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramCustomEmojiPack" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramSetId" TEXT,
    "shortName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "telegramLink" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramCustomEmojiPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramCustomEmoji" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "mimeType" TEXT,
    "kind" TEXT NOT NULL,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "needsRepainting" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "assetKey" TEXT,
    "assetUrl" TEXT,
    "assetBytes" BYTEA,
    "renderAssetKey" TEXT,
    "renderAssetUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramCustomEmoji_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelCustomEmojiPack" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramChannelCustomEmojiPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelTimePost" (
    "id" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "iconId" TEXT,
    "title" TEXT NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelTimePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelAdAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "assignedMemberId" TEXT,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TelegramChannelAdAnalysisStatus" NOT NULL DEFAULT 'WATCH_LATER',
    "verdict" TEXT,
    "price" DECIMAL(65,30),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "avgViews" DOUBLE PRECISION,
    "avgReactions" DOUBLE PRECISION,
    "avgForwards" DOUBLE PRECISION,
    "postsCount" INTEGER,
    "cpm" DECIMAL(65,30),
    "reasonTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reasonSummary" TEXT,
    "notes" TEXT,
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelAdAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelDailyStats" (
    "id" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "subscribersCount" INTEGER,
    "joinedCount" INTEGER,
    "leftCount" INTEGER,
    "netGrowthCount" INTEGER,
    "viewsCount" INTEGER,
    "reactionsCount" INTEGER,
    "forwardsCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramChannelDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelStatsSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotDate" DATE NOT NULL,
    "rawStats" JSONB NOT NULL,
    "normalizedStats" JSONB NOT NULL,
    "availableFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramChannelStatsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelStatsPoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "seriesLabel" TEXT NOT NULL,
    "color" TEXT,
    "graphType" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "latestSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelStatsPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelAudienceSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscribersCount" INTEGER,
    "activeSubscribersEstimate" INTEGER,
    "viewRate" DOUBLE PRECISION,
    "avgViewsRaw" DOUBLE PRECISION,
    "avgViewsAdjusted" DOUBLE PRECISION,
    "avgReactionsRaw" DOUBLE PRECISION,
    "avgReactionsAdjusted" DOUBLE PRECISION,
    "rawAvgViews" DOUBLE PRECISION,
    "rawAvgReactions" DOUBLE PRECISION,
    "rawViewRate" DOUBLE PRECISION,
    "effectiveSubscribersCount" INTEGER,
    "cappedActiveSubscribersEstimate" INTEGER,
    "cappedViewRate" DOUBLE PRECISION,
    "dataQuality" TEXT NOT NULL DEFAULT 'normal',
    "dataQualityReason" TEXT,
    "hasExternalTrafficAnomaly" BOOLEAN NOT NULL DEFAULT false,
    "hasSubscriberBasePollution" BOOLEAN NOT NULL DEFAULT false,
    "postsWindow" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'sync',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramChannelAudienceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelNetwork" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "assignedMemberId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChannelNetworkMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramChannelNetworkMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdProduct" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "topDurationMinutes" INTEGER,
    "feedDurationHours" INTEGER,
    "deleteAfterHours" INTEGER,
    "isPermanent" BOOLEAN NOT NULL DEFAULT false,
    "defaultPricingMode" "TelegramAdPricingMode" NOT NULL,
    "defaultCpm" DECIMAL(65,30),
    "defaultFixedPrice" DECIMAL(65,30),
    "minimumPrice" DECIMAL(65,30),
    "currency" VARCHAR(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSchedulePolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "autoFrequencyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "expectedOrganicPostsPerDay" DECIMAL(65,30),
    "useWorkspaceDefault" BOOLEAN NOT NULL DEFAULT false,
    "organicPostsPerAdSlot" INTEGER NOT NULL DEFAULT 3,
    "maxAdsPerDay" INTEGER NOT NULL,
    "minHoursBetweenAds" INTEGER NOT NULL,
    "minDaysBetweenAds" INTEGER NOT NULL,
    "slotStrategy" "TelegramAdSlotStrategy" NOT NULL,
    "fallbackSlotTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowManualSlots" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSchedulePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSalesWorkspaceSettings" (
    "workspaceId" TEXT NOT NULL,
    "defaultOrganicPostsPerAdSlot" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSalesWorkspaceSettings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "TelegramAdSalesMemberPreferences" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceMemberId" TEXT NOT NULL,
    "selectedChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedNetworkId" TEXT,
    "calendarView" TEXT NOT NULL DEFAULT 'week',
    "initialized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSalesMemberPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdPriceSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "telegramAdProductId" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "methodVersion" TEXT NOT NULL,
    "statisticsWindowDays" INTEGER NOT NULL,
    "postsSampleCount" INTEGER NOT NULL,
    "expectedViews" INTEGER NOT NULL,
    "averageViews" DECIMAL(65,30),
    "medianViews" DECIMAL(65,30),
    "adjustedViews" DECIMAL(65,30),
    "targetCpm" DECIMAL(65,30) NOT NULL,
    "minimumCpm" DECIMAL(65,30),
    "recommendedPrice" DECIMAL(65,30) NOT NULL,
    "minimumPrice" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAdPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdInventoryDailySnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "eligibleSlots" INTEGER NOT NULL,
    "bookedSlots" INTEGER NOT NULL,
    "publishedSlots" INTEGER NOT NULL,
    "cancelledSlots" INTEGER NOT NULL,
    "missedSlots" INTEGER NOT NULL,
    "blockedSlots" INTEGER NOT NULL,
    "recommendedInventoryRevenue" DECIMAL(65,30) NOT NULL,
    "minimumInventoryRevenue" DECIMAL(65,30) NOT NULL,
    "agreedRevenue" DECIMAL(65,30) NOT NULL,
    "paidRevenue" DECIMAL(65,30) NOT NULL,
    "outstandingRevenue" DECIMAL(65,30) NOT NULL,
    "underpricingLoss" DECIMAL(65,30) NOT NULL,
    "unsoldInventoryOpportunity" DECIMAL(65,30) NOT NULL,
    "expectedViews" INTEGER NOT NULL,
    "actualViews" INTEGER NOT NULL,
    "policySnapshot" JSONB,
    "productSnapshot" JSONB,
    "pricingSnapshot" JSONB,
    "calculationVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdInventoryDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSale" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "advertiserId" TEXT,
    "advertiserName" TEXT NOT NULL,
    "advertiserTelegram" TEXT,
    "advertiserContact" TEXT,
    "advertiserNameSnapshot" TEXT,
    "advertiserTelegramSnapshot" TEXT,
    "advertiserCompanySnapshot" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "status" "TelegramAdSaleStatus" NOT NULL DEFAULT 'DRAFT',
    "crmDealStage" "TelegramAdCrmDealStage" NOT NULL DEFAULT 'NEW_LEAD',
    "expectedCloseAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "settlementCurrency" VARCHAR(3) NOT NULL,
    "reservedUntil" TIMESTAMP(3),
    "sourceTaskId" TEXT,
    "sourceAdvertiserActivityId" TEXT,
    "createdByUserId" TEXT,
    "assignedMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSalePlacement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramAdSaleId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "telegramChannelNetworkId" TEXT,
    "telegramAdProductId" TEXT,
    "inventoryOpportunityKey" TEXT,
    "pricingSnapshotId" TEXT,
    "status" "TelegramAdPlacementStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "pricingMode" "TelegramAdPricingMode" NOT NULL,
    "expectedViews" INTEGER NOT NULL,
    "quotedCpm" DECIMAL(65,30),
    "recommendedPrice" DECIMAL(65,30) NOT NULL,
    "minimumPrice" DECIMAL(65,30) NOT NULL,
    "agreedPrice" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "scheduledManagedAt" TIMESTAMP(3),
    "topDurationMinutesSnapshot" INTEGER,
    "feedDurationHoursSnapshot" INTEGER,
    "deleteAfterHoursSnapshot" INTEGER,
    "isPermanentSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "manualPriceReason" TEXT,
    "managedPostId" TEXT,
    "telegramPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "plannedDeleteAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "lastDeletionAttemptAt" TIMESTAMP(3),
    "lastDeletionError" TEXT,
    "actualViews24h" INTEGER,
    "actualViews48h" INTEGER,
    "actualViewsFinal" INTEGER,
    "actualReactionsFinal" INTEGER,
    "actualCpm" DECIMAL(65,30),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSalePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdvertiser" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "companyName" TEXT,
    "telegramUsername" TEXT,
    "telegramUserId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "description" TEXT,
    "source" TEXT,
    "status" "TelegramAdvertiserStatus" NOT NULL DEFAULT 'LEAD',
    "lifecycleStage" "TelegramAdvertiserLifecycleStage" NOT NULL DEFAULT 'NEW',
    "ownerMemberId" TEXT,
    "createdByUserId" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "lastPurchaseAt" TIMESTAMP(3),
    "nextContactAt" TIMESTAMP(3),
    "defaultFollowUpDays" INTEGER,
    "preferredCurrency" VARCHAR(3),
    "preferredContactMethod" "TelegramAdvertiserContactType",
    "totalSalesCount" INTEGER NOT NULL DEFAULT 0,
    "completedSalesCount" INTEGER NOT NULL DEFAULT 0,
    "totalPlacementsCount" INTEGER NOT NULL DEFAULT 0,
    "totalRevenueInPrimaryCurrency" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "averageOrderValueInPrimaryCurrency" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "firstPurchaseAt" TIMESTAMP(3),
    "repeatCustomerAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdvertiser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdvertiserContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "type" "TelegramAdvertiserContactType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdvertiserContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdvertiserTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdvertiserTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdvertiserTagAssignment" (
    "advertiserId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAdvertiserTagAssignment_pkey" PRIMARY KEY ("advertiserId","tagId")
);

-- CreateTable
CREATE TABLE "TelegramAdvertiserActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "saleId" TEXT,
    "placementId" TEXT,
    "taskId" TEXT,
    "actorUserId" TEXT,
    "actorMemberId" TEXT,
    "type" "TelegramAdvertiserActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAdvertiserActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdvertiserTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "saleId" TEXT,
    "placementId" TEXT,
    "assignedMemberId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "type" "TelegramAdvertiserTaskType" NOT NULL,
    "status" "TelegramAdvertiserTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TelegramAdvertiserTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "remindAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "completionNote" TEXT,
    "automationRuleId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdvertiserTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdCrmMemberSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceMemberId" TEXT NOT NULL,
    "defaultFollowUpDays" INTEGER NOT NULL DEFAULT 30,
    "defaultReactivationDays" INTEGER NOT NULL DEFAULT 60,
    "autoCreateFollowUpAfterPlacement" BOOLEAN NOT NULL DEFAULT true,
    "autoCreateFeedbackTask" BOOLEAN NOT NULL DEFAULT false,
    "autoCreatePaymentFollowUp" BOOLEAN NOT NULL DEFAULT true,
    "dailyDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "overdueDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "preferredReminderTime" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultTaskPriority" "TelegramAdvertiserTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "defaultAdvertiserOwnerMode" "TelegramAdCrmOwnerMode" NOT NULL DEFAULT 'SALE_ASSIGNEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdCrmMemberSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdCrmWorkspaceSettings" (
    "workspaceId" TEXT NOT NULL,
    "defaultFollowUpDays" INTEGER NOT NULL DEFAULT 30,
    "defaultReactivationDays" INTEGER NOT NULL DEFAULT 60,
    "defaultSaleOwnerAssignment" "TelegramAdCrmOwnerMode" NOT NULL DEFAULT 'SALE_ASSIGNEE',
    "autoCreateAdvertiserFromSale" BOOLEAN NOT NULL DEFAULT true,
    "requireAdvertiserForConfirmedSale" BOOLEAN NOT NULL DEFAULT false,
    "duplicateDetectionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inactivityThresholdDays" INTEGER NOT NULL DEFAULT 60,
    "highValueCustomerThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdCrmWorkspaceSettings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "TelegramAdvertiserAutomationRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" "TelegramAdvertiserAutomationEventType" NOT NULL,
    "actionType" "TelegramAdvertiserAutomationActionType" NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "assignedMemberMode" "TelegramAdCrmOwnerMode" NOT NULL DEFAULT 'SALE_ASSIGNEE',
    "specificMemberId" TEXT,
    "conditions" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" "TelegramAdvertiserTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdvertiserAutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdvertiserAutomationExecution" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationRuleId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "saleId" TEXT,
    "placementId" TEXT,
    "taskId" TEXT,
    "eventKey" TEXT NOT NULL,
    "status" "TelegramAdvertiserAutomationExecutionStatus" NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "createdTaskId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAdvertiserAutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdPlacementAdvertiserResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "leadsCount" INTEGER,
    "salesCount" INTEGER,
    "revenue" DECIMAL(65,30),
    "currency" VARCHAR(3),
    "conversionRate" DECIMAL(65,30),
    "roi" DECIMAL(65,30),
    "source" "TelegramAdPlacementAdvertiserResultSource" NOT NULL,
    "notes" TEXT,
    "reportedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdPlacementAdvertiserResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSalePayment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramAdSaleId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountInPrimaryCurrency" DECIMAL(65,30) NOT NULL,
    "exchangeRateToPrimary" DECIMAL(65,30) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "TelegramAdSalePaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotencyKey" TEXT,
    "reversalTransactionId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSalePaymentAllocation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramAdSalePaymentId" TEXT NOT NULL,
    "telegramAdSalePlacementId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountInPrimaryCurrency" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAdSalePaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promo" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "iconId" TEXT,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "angle" TEXT,
    "imageData" TEXT,
    "status" "PromoStatus" NOT NULL DEFAULT 'draft',
    "assignedMemberId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignPromo" (
    "id" TEXT NOT NULL,
    "adCampaignId" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaignPromo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertisingSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AdvertisingSourceType" NOT NULL DEFAULT 'telegram_channel',
    "url" TEXT,
    "telegramUsername" TEXT,
    "description" TEXT,
    "contactInfo" TEXT,
    "notes" TEXT,
    "imageUrl" TEXT,
    "subscribersCount" INTEGER NOT NULL DEFAULT 0,
    "channelTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assignedMemberId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvertisingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "advertisingSourceId" TEXT,
    "promoId" TEXT,
    "accountId" TEXT,
    "title" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'planned',
    "price" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "priceInPrimaryCurrency" DECIMAL(65,30) NOT NULL,
    "exchangeRateToPrimary" DECIMAL(65,30) NOT NULL,
    "inviteLink" TEXT,
    "telegramInviteLinkId" TEXT,
    "sourcePostUrl" TEXT,
    "sourcePostViews" INTEGER,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "placementDate" TIMESTAMP(3),
    "joinedCount" INTEGER NOT NULL DEFAULT 0,
    "leftCount" INTEGER,
    "netGrowthCount" INTEGER,
    "cpa" DECIMAL(65,30),
    "cpm" DECIMAL(65,30),
    "subscribersBefore" INTEGER,
    "avgViewsBefore" DOUBLE PRECISION,
    "avgReactionsBefore" DOUBLE PRECISION,
    "subscribersAfter24h" INTEGER,
    "subscribersAfter48h" INTEGER,
    "subscribersAfter72h" INTEGER,
    "subscribersAfter7d" INTEGER,
    "subscribersAfter30d" INTEGER,
    "avgViewsAfter" DOUBLE PRECISION,
    "avgReactionsAfter" DOUBLE PRECISION,
    "clicksAfter" INTEGER,
    "newSubscribers" INTEGER,
    "activeSubscribersFromAd" INTEGER,
    "activeCpa" DECIMAL(65,30),
    "activeRate" DOUBLE PRECISION,
    "rawActiveSubscribersFromAd" INTEGER,
    "rawViewRateAfter" DOUBLE PRECISION,
    "cappedActiveSubscribersFromAd" INTEGER,
    "cappedActiveRate" DOUBLE PRECISION,
    "cappedActiveCpa" DECIMAL(65,30),
    "cappedViewRateAfter" DOUBLE PRECISION,
    "adDataQuality" TEXT NOT NULL DEFAULT 'normal',
    "adDataQualityReason" TEXT,
    "hasViewAnomaly" BOOLEAN NOT NULL DEFAULT false,
    "hasSubscriberBasePollution" BOOLEAN NOT NULL DEFAULT false,
    "unsub24h" INTEGER,
    "unsub48h" INTEGER,
    "unsub72h" INTEGER,
    "unsub7d" INTEGER,
    "unsub30d" INTEGER,
    "retention24h" DOUBLE PRECISION,
    "retention48h" DOUBLE PRECISION,
    "retention72h" DOUBLE PRECISION,
    "retention7d" DOUBLE PRECISION,
    "retention30d" DOUBLE PRECISION,
    "cpaStatus" TEXT,
    "activeCpaStatus" TEXT,
    "retentionStatus" TEXT,
    "overallStatus" TEXT,
    "decisionText" TEXT,
    "excludeFromAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "analyticsNotes" TEXT,
    "analyticsLastCalculatedAt" TIMESTAMP(3),
    "analyticsLastAutoSyncedAt" TIMESTAMP(3),
    "analyticsLastManualSyncedAt" TIMESTAMP(3),
    "customTitleTemplate" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "assignedMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignAdmissionBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "adCampaignId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "status" "AdCampaignAdmissionBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "detectionMode" "AdCampaignAdmissionDetectionMode" NOT NULL,
    "analysisStartedAt" TIMESTAMP(3) NOT NULL,
    "firstObservedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "timeBoundarySource" "AdCampaignAdmissionTimeBoundarySource" NOT NULL,
    "releasedSubscribersCount" INTEGER NOT NULL,
    "joinedBefore" INTEGER NOT NULL DEFAULT 0,
    "joinedAfter" INTEGER NOT NULL DEFAULT 0,
    "requestedBefore" INTEGER NOT NULL DEFAULT 0,
    "requestedAfter" INTEGER NOT NULL DEFAULT 0,
    "sourceLinks" JSONB NOT NULL,
    "baselineSnapshotAt" TIMESTAMP(3),
    "baselineMethod" "AdCampaignAdmissionBaselineMethod" NOT NULL DEFAULT 'UNAVAILABLE',
    "trackedPosts" JSONB NOT NULL,
    "trackedPostsCount" INTEGER NOT NULL DEFAULT 0,
    "baselineAvgViews" DOUBLE PRECISION,
    "baselineAvgReactions" DOUBLE PRECISION,
    "dataQuality" "AdCampaignAdmissionDataQuality" NOT NULL DEFAULT 'GOOD',
    "dataQualityReason" TEXT,
    "batchFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaignAdmissionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignAdmissionViewSnapshot" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "sourceMetricCollectedAt" TIMESTAMP(3) NOT NULL,
    "avgViews" DOUBLE PRECISION,
    "avgReactions" DOUBLE PRECISION,
    "cumulativeAvgViewsUplift" DOUBLE PRECISION,
    "incrementalAvgViewsUplift" DOUBLE PRECISION,
    "estimatedActiveSubscribers" INTEGER,
    "activationRate" DOUBLE PRECISION,
    "trackedPostsCount" INTEGER NOT NULL DEFAULT 0,
    "channelSubscribersCount" INTEGER,
    "joinedCount" INTEGER,
    "requestedCount" INTEGER,
    "dataQuality" "AdCampaignAdmissionDataQuality" NOT NULL DEFAULT 'GOOD',
    "dataQualityReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaignAdmissionViewSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignAdmissionBackfillState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "lastProcessedInviteSnapshotAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaignAdmissionBackfillState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdHypothesis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'testing',
    "conclusion" TEXT,
    "iconId" TEXT,
    "telegramChannelId" TEXT,
    "assignedMemberId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdHypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdHypothesisCampaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "adCampaignId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdHypothesisCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAnalyticsSyncRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "source" TEXT NOT NULL DEFAULT 'cron',
    "channelsProcessed" INTEGER NOT NULL DEFAULT 0,
    "campaignsProcessed" INTEGER NOT NULL DEFAULT 0,
    "snapshotsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyAnalyticsSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTaskConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "taskKey" TEXT NOT NULL,
    "scope" "ScheduledTaskScope" NOT NULL,
    "lockKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoDisarmed" BOOLEAN NOT NULL DEFAULT false,
    "schedule" JSONB NOT NULL,
    "notificationChannel" "ScheduledTaskNotificationChannel" NOT NULL DEFAULT 'SYSTEM_TELEGRAM_BOT',
    "notifyOnSuccess" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT false,
    "nextScheduledRunAt" TIMESTAMP(3),
    "scheduledClaimOwner" TEXT,
    "scheduledClaimExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTaskConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTaskRun" (
    "id" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "workspaceId" TEXT,
    "scheduledTaskConfigId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "trigger" "ScheduledTaskTrigger" NOT NULL,
    "status" "ScheduledTaskRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "resultSummary" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledTaskRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTaskLease" (
    "id" TEXT NOT NULL,
    "lockKey" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "workspaceId" TEXT,
    "ownerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTaskLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "level" "ApplicationLogLevel" NOT NULL,
    "kind" "ApplicationLogKind" NOT NULL,
    "environment" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "source" TEXT,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "correlationId" TEXT,
    "requestId" TEXT,
    "method" TEXT,
    "endpoint" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "errorName" TEXT,
    "errorCode" TEXT,
    "stack" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignAdvertisingChannel" (
    "id" TEXT NOT NULL,
    "adCampaignId" TEXT NOT NULL,
    "advertisingSourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaignAdvertisingChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignTelegramChannelPlacement" (
    "id" TEXT NOT NULL,
    "adCampaignId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaignTelegramChannelPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramInviteLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "adCampaignId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "telegramInviteLinkId" TEXT,
    "createdBy" TEXT,
    "createsJoinRequest" BOOLEAN,
    "expireDate" TIMESTAMP(3),
    "memberLimit" INTEGER,
    "joinedCount" INTEGER NOT NULL DEFAULT 0,
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "creatorTelegramUserId" TEXT,
    "creatorUsername" TEXT,
    "creatorFirstName" TEXT,
    "creatorLastName" TEXT,
    "creatorPhotoUrl" TEXT,
    "creatorMemberId" TEXT,
    "creatorMatchSource" "TelegramInviteLinkCreatorMatchSource",
    "telegramCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramInviteLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramInviteLinkSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "inviteLinkId" TEXT NOT NULL,
    "adCampaignId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "joinedCount" INTEGER NOT NULL DEFAULT 0,
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramInviteLinkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramBotIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "botTokenEncrypted" TEXT NOT NULL,
    "botTokenIv" TEXT NOT NULL,
    "botTokenAuthTag" TEXT NOT NULL,
    "botTokenMasked" TEXT NOT NULL,
    "botId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastErrorMessage" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "applicationType" "TelegramBotApplicationType" NOT NULL DEFAULT 'NONE',
    "runtimeStatus" "TelegramBotRuntimeStatus" NOT NULL DEFAULT 'DISABLED',
    "webhookStatus" "TelegramBotWebhookStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "webhookUrl" TEXT,
    "webhookSecretEncrypted" TEXT,
    "webhookSecretIv" TEXT,
    "webhookSecretAuthTag" TEXT,
    "webhookConfiguredAt" TIMESTAMP(3),
    "pendingApplicationType" "TelegramBotApplicationType",
    "pendingWebhookUrl" TEXT,
    "pendingWebhookSecretEncrypted" TEXT,
    "pendingWebhookSecretIv" TEXT,
    "pendingWebhookSecretAuthTag" TEXT,
    "runtimeTransitionStartedAt" TIMESTAMP(3),
    "lastUpdateProcessedAt" TIMESTAMP(3),
    "lastRuntimeError" TEXT,
    "assignedMemberId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBotIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramBotApplicationWorkspaceAccess" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationType" "TelegramBotApplicationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBotApplicationWorkspaceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramBotUser" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "languageCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBotUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramBotUpdateLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "updateType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "TelegramBotUpdateStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBotUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramBotDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "telegramBotUserId" TEXT,
    "financeReminderId" TEXT,
    "chatId" TEXT NOT NULL,
    "type" "TelegramBotDeliveryType" NOT NULL,
    "payload" JSONB NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "TelegramBotDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBotDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "captchaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "captchaType" "GreeterCaptchaType" NOT NULL DEFAULT 'BUTTON_CONFIRM',
    "captchaMessage" TEXT NOT NULL DEFAULT 'To confirm you are human, tap the button below.',
    "confirmButtonText" TEXT NOT NULL DEFAULT 'I am human',
    "choicePrompt" TEXT NOT NULL DEFAULT 'Choose the number {{captcha.answer}}',
    "timeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "successMessage" TEXT DEFAULT 'Approved for {{channel.title}}.',
    "failureMessage" TEXT,
    "failureBehavior" "GreeterFailureBehavior" NOT NULL DEFAULT 'KEEP_PENDING',
    "draftRevision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "currentPublishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeterConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterConfigVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "captchaEnabled" BOOLEAN NOT NULL,
    "captchaType" "GreeterCaptchaType" NOT NULL,
    "captchaMessage" TEXT NOT NULL,
    "confirmButtonText" TEXT NOT NULL,
    "choicePrompt" TEXT NOT NULL,
    "timeoutMinutes" INTEGER NOT NULL,
    "successMessage" TEXT,
    "failureMessage" TEXT,
    "failureBehavior" "GreeterFailureBehavior" NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GreeterConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "useGlobalConfig" BOOLEAN NOT NULL DEFAULT true,
    "captchaEnabled" BOOLEAN,
    "captchaType" "GreeterCaptchaType",
    "captchaMessage" TEXT,
    "confirmButtonText" TEXT,
    "choicePrompt" TEXT,
    "timeoutMinutes" INTEGER,
    "successMessage" TEXT,
    "failureMessage" TEXT,
    "failureBehavior" "GreeterFailureBehavior",
    "permissionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeterChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterChannelConfigVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "configVersionId" TEXT NOT NULL,
    "greeterChannelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "useGlobalConfig" BOOLEAN NOT NULL,
    "captchaEnabled" BOOLEAN,
    "captchaType" "GreeterCaptchaType",
    "captchaMessage" TEXT,
    "confirmButtonText" TEXT,
    "choicePrompt" TEXT,
    "timeoutMinutes" INTEGER,
    "successMessage" TEXT,
    "failureMessage" TEXT,
    "failureBehavior" "GreeterFailureBehavior",

    CONSTRAINT "GreeterChannelConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterJoinRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "greeterChannelId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "telegramBotUserId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "status" "GreeterJoinRequestStatus" NOT NULL DEFAULT 'PENDING_CAPTCHA',
    "captchaStartedAt" TIMESTAMP(3),
    "captchaPassedAt" TIMESTAMP(3),
    "captchaFailedAt" TIMESTAMP(3),
    "captchaWrongAttempts" INTEGER NOT NULL DEFAULT 0,
    "captchaChatId" TEXT,
    "captchaDeliveryId" TEXT,
    "outcomeDeliveryId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "captchaAnswer" TEXT,
    "callbackToken" TEXT NOT NULL,
    "sourceInviteLink" TEXT,
    "lastDecisionError" TEXT,
    "decisionAppliedAt" TIMESTAMP(3),
    "expiryClaimOwner" TEXT,
    "expiryClaimUntil" TIMESTAMP(3),
    "environment" "GreeterAutomationEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "testSessionId" TEXT,
    "testGeneration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeterJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterSequence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "channelId" TEXT,
    "name" TEXT NOT NULL,
    "trigger" "GreeterSequenceTrigger" NOT NULL DEFAULT 'AFTER_START',
    "draftRevision" INTEGER NOT NULL DEFAULT 1,
    "currentPublishedVersionId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeterSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterSequenceVersion" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "GreeterSequenceVersionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "sourceDraftRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GreeterSequenceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterSequenceStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT,
    "versionId" TEXT,
    "position" INTEGER NOT NULL,
    "delaySeconds" INTEGER NOT NULL DEFAULT 0,
    "messageText" TEXT NOT NULL,
    "buttons" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeterSequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterSequenceEnrollment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "sequenceVersionId" TEXT,
    "sequenceId" TEXT NOT NULL,
    "telegramBotUserId" TEXT NOT NULL,
    "acquiredChannelId" TEXT,
    "acquisitionJoinRequestId" TEXT,
    "logicalScopeKey" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "environment" "GreeterAutomationEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "GreeterSequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterSequenceStepExecution" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" "GreeterStepExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "deliveryId" TEXT,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeterSequenceStepExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterBroadcast" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "buttons" JSONB,
    "audience" "GreeterBroadcastAudience" NOT NULL DEFAULT 'ALL_ALIVE',
    "audienceUserState" "GreeterUserState",
    "channelId" TEXT,
    "status" "GreeterBroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeterBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterBroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "telegramBotUserId" TEXT NOT NULL,
    "acquiredChannelId" TEXT,
    "deliveryId" TEXT,
    "status" "GreeterBroadcastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GreeterBroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterTestSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "telegramBotUserId" TEXT,
    "channelId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3),
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeterTestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreeterUserEnvironmentState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "telegramBotUserId" TEXT NOT NULL,
    "environment" "GreeterAutomationEnvironment" NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeterUserEnvironmentState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceProfile" (
    "id" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "telegramBotUserId" TEXT NOT NULL,
    "defaultCurrency" VARCHAR(3) NOT NULL DEFAULT 'UAH',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Warsaw',
    "locale" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAiProviderConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT,
    "provider" "FinanceAiProvider" NOT NULL DEFAULT 'OPENAI',
    "apiKeyEncrypted" TEXT,
    "apiKeyIv" TEXT,
    "apiKeyAuthTag" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-5.6-luna',
    "connectionStatus" "FinanceAiConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastCheckedAt" TIMESTAMP(3),
    "lastValidationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceAccountType" NOT NULL DEFAULT 'OTHER',
    "currency" VARCHAR(3) NOT NULL,
    "openingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "type" "FinanceTransactionType" NOT NULL,
    "key" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTransaction" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "type" "FinanceTransactionType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountInDefaultCurrency" DECIMAL(65,30) NOT NULL,
    "exchangeRateToDefault" DECIMAL(65,30) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "merchantNormalized" TEXT,
    "source" "FinanceTransactionSource" NOT NULL DEFAULT 'CHAT',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTransfer" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "fromAmount" DECIMAL(65,30) NOT NULL,
    "fromCurrency" VARCHAR(3) NOT NULL,
    "toAmount" DECIMAL(65,30) NOT NULL,
    "toCurrency" VARCHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(65,30),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceMerchantMapping" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "merchantNormalized" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMerchantMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSpendingLimit" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "period" "FinanceLimitPeriod" NOT NULL DEFAULT 'MONTH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSpendingLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReminder" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "recurrence" "FinanceReminderRecurrence" NOT NULL DEFAULT 'MONTHLY',
    "dayOfMonth" INTEGER NOT NULL,
    "reminderOffsetMinutes" INTEGER NOT NULL DEFAULT 0,
    "nextOccurrenceAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceGoal" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(65,30) NOT NULL,
    "currentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL,
    "targetDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePendingProposal" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "telegramBotUserId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "FinanceProposalStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancePendingProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssistantProfile" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "incomeContext" TEXT,
    "familyContext" TEXT,
    "goals" TEXT,
    "priorities" TEXT,
    "fixedExpenses" TEXT,
    "protectedExpenses" TEXT,
    "constraints" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAssistantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAiUsage" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" "FinanceAiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostMicros" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotBillingProviderConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT,
    "provider" "BotBillingProvider" NOT NULL,
    "mode" "BotBillingProviderMode" NOT NULL,
    "secretKeyEncrypted" TEXT,
    "secretKeyIv" TEXT,
    "secretKeyAuthTag" TEXT,
    "webhookSecretEncrypted" TEXT,
    "webhookSecretIv" TEXT,
    "webhookSecretAuthTag" TEXT,
    "publicKeyMasked" TEXT,
    "connectionStatus" "BotBillingConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastCheckedAt" TIMESTAMP(3),
    "lastValidationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotBillingProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSubscriptionPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "freeCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paidCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotPlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "interval" "BotBillingInterval" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "providerPriceIdentity" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotPlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "telegramBotUserId" TEXT NOT NULL,
    "planId" TEXT,
    "planPriceId" TEXT,
    "source" "BotSubscriptionSource" NOT NULL,
    "status" "BotSubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "currency" VARCHAR(3),
    "interval" "BotBillingInterval",
    "amountMinor" INTEGER,
    "priceVersion" INTEGER,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSubscriptionGrant" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "source" "BotSubscriptionGrantSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSubscriptionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotCoupon" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "planId" TEXT,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER,
    "amountOffMinor" INTEGER,
    "currency" VARCHAR(3),
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "newUsersOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotCouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "telegramBotUserId" TEXT NOT NULL,
    "planPriceId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotCouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotProviderCustomer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "telegramBotUserId" TEXT NOT NULL,
    "provider" "BotBillingProvider" NOT NULL,
    "mode" "BotBillingProviderMode" NOT NULL,
    "providerCustomerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotProviderCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotProviderSubscription" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "provider" "BotBillingProvider" NOT NULL,
    "mode" "BotBillingProviderMode" NOT NULL,
    "providerSubscriptionId" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "rawSnapshot" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotProviderSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotBillingEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" "BotBillingProvider",
    "mode" "BotBillingProviderMode",
    "providerEventId" TEXT,
    "type" "BotBillingEventType" NOT NULL,
    "amountMinor" INTEGER,
    "currency" VARCHAR(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotBillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemBotLinkToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "telegramMessageId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemBotLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramSystemBotConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "currentWorkspaceId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSystemBotConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramSystemBotTaskSubscription" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSuccess" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSystemBotTaskSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramSystemBotFinanceDraft" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "TelegramSystemBotFinanceDraftKind" NOT NULL DEFAULT 'TRANSACTION',
    "type" "TransactionType",
    "amount" DECIMAL(65,30),
    "description" TEXT,
    "accountId" TEXT,
    "categoryId" TEXT,
    "fromAccountId" TEXT,
    "toAccountId" TEXT,
    "fromAmount" DECIMAL(65,30),
    "toAmount" DECIMAL(65,30),
    "status" "TelegramSystemBotFinanceDraftStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "transferId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSystemBotFinanceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramSystemBotUpdateLog" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "updateType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSystemBotUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramPost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "telegramMessageId" TEXT NOT NULL,
    "text" TEXT,
    "formattedText" TEXT,
    "hasMedia" BOOLEAN NOT NULL DEFAULT false,
    "mediaKind" TEXT,
    "postDate" TIMESTAMP(3) NOT NULL,
    "viewsCount" INTEGER,
    "forwardsCount" INTEGER,
    "reactionsCount" INTEGER,
    "commentsCount" INTEGER,
    "manualOwnViews" INTEGER NOT NULL DEFAULT 0,
    "manualOwnReactions" INTEGER NOT NULL DEFAULT 0,
    "excludeFromAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "reactions" JSONB,
    "rawMessage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramManagedPost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "buttonRows" JSONB,
    "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
    "remoteImportKey" TEXT,
    "status" "TelegramManagedPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "scheduleMode" TEXT,
    "publishedAt" TIMESTAMP(3),
    "telegramScheduledMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telegramMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telegramMessageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telegramIdVerificationStatus" "TelegramManagedPostIdVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "telegramLinkSource" "TelegramManagedPostLinkSource" NOT NULL DEFAULT 'AUTO',
    "telegramIdVerifiedAt" TIMESTAMP(3),
    "telegramIdLastCheckedAt" TIMESTAMP(3),
    "telegramRemoteStatus" "TelegramManagedPostRemoteStatus" NOT NULL DEFAULT 'NONE',
    "lastTelegramSyncedAt" TIMESTAMP(3),
    "lastTelegramSyncNote" TEXT,
    "sourceType" "TelegramSourceType",
    "sourceId" TEXT,
    "sourceWasPremium" BOOLEAN,
    "captionLengthMaxUsed" INTEGER,
    "messageLengthMaxUsed" INTEGER,
    "publishMode" TEXT,
    "lastError" TEXT,
    "plannerFormatId" TEXT,
    "plannerSlotId" TEXT,
    "plannerRunId" TEXT,
    "plannerPlannedAt" TIMESTAMP(3),
    "plannerProvenance" JSONB,
    "assignedMemberId" TEXT NOT NULL,
    "icon" TEXT,
    "groupId" TEXT,
    "groupPosition" INTEGER,
    "statusPosition" INTEGER,
    "sidebarPosition" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramManagedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramPostPlannerFormat" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramPostPlannerFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramPostPlannerSlot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "formatId" TEXT,
    "postGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weekday" INTEGER NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "timezone" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramPostPlannerSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramManagedPostRevision" (
    "id" TEXT NOT NULL,
    "telegramManagedPostId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "buttonRows" JSONB,
    "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
    "remoteImportKey" TEXT,
    "status" "TelegramManagedPostStatus" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "scheduleMode" TEXT,
    "publishedAt" TIMESTAMP(3),
    "telegramScheduledMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telegramMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telegramMessageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telegramIdVerificationStatus" "TelegramManagedPostIdVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "telegramLinkSource" "TelegramManagedPostLinkSource" NOT NULL DEFAULT 'AUTO',
    "telegramIdVerifiedAt" TIMESTAMP(3),
    "telegramIdLastCheckedAt" TIMESTAMP(3),
    "telegramRemoteStatus" "TelegramManagedPostRemoteStatus" NOT NULL DEFAULT 'NONE',
    "lastTelegramSyncedAt" TIMESTAMP(3),
    "lastTelegramSyncNote" TEXT,
    "sourceType" "TelegramSourceType",
    "sourceId" TEXT,
    "sourceWasPremium" BOOLEAN,
    "captionLengthMaxUsed" INTEGER,
    "messageLengthMaxUsed" INTEGER,
    "publishMode" TEXT,
    "lastError" TEXT,
    "assignedMemberId" TEXT NOT NULL,
    "icon" TEXT,
    "groupId" TEXT,
    "groupPosition" INTEGER,
    "statusPosition" INTEGER,
    "sidebarPosition" INTEGER,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramManagedPostRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostGroup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" TEXT,
    "statusNumberingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdByMemberId" TEXT NOT NULL,
    "sidebarPosition" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramPostMetricSnapshot" (
    "id" TEXT NOT NULL,
    "telegramPostId" TEXT NOT NULL,
    "viewsCount" INTEGER,
    "forwardsCount" INTEGER,
    "reactionsCount" INTEGER,
    "commentsCount" INTEGER,
    "reactions" JSONB,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramPostMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "baseCurrency" VARCHAR(3) NOT NULL,
    "targetCurrency" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Icon" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" "IconType" NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "imageUrl" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Icon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_seedKey_key" ON "User"("seedKey");

-- CreateIndex
CREATE INDEX "PromptNote_workspaceId_updatedAt_idx" ON "PromptNote"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "PromptNote_workspaceId_telegramChannelId_idx" ON "PromptNote"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE INDEX "PromptNote_workspaceId_postGroupId_idx" ON "PromptNote"("workspaceId", "postGroupId");

-- CreateIndex
CREATE INDEX "PromptNote_workspaceId_assignedMemberId_idx" ON "PromptNote"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "PromptNote_workspaceId_iconId_idx" ON "PromptNote"("workspaceId", "iconId");

-- CreateIndex
CREATE INDEX "TelegramAdSalesTextTemplate_workspaceId_updatedAt_idx" ON "TelegramAdSalesTextTemplate"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "TelegramAdSalesTextTemplate_workspaceId_iconId_idx" ON "TelegramAdSalesTextTemplate"("workspaceId", "iconId");

-- CreateIndex
CREATE INDEX "TelegramUserAccountIntegration_workspaceId_assignedMemberId_idx" ON "TelegramUserAccountIntegration"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "TelegramChannelAdminLink_workspaceId_telegramChannelId_idx" ON "TelegramChannelAdminLink"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE INDEX "TelegramChannelAdminLink_workspaceId_telegramUserAccountInt_idx" ON "TelegramChannelAdminLink"("workspaceId", "telegramUserAccountIntegrationId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelAdminLink_workspaceId_telegramChannelId_tele_key" ON "TelegramChannelAdminLink"("workspaceId", "telegramChannelId", "telegramUserAccountIntegrationId");

-- CreateIndex
CREATE INDEX "TelegramChannelSourceAccess_workspaceId_channelId_idx" ON "TelegramChannelSourceAccess"("workspaceId", "channelId");

-- CreateIndex
CREATE INDEX "TelegramChannelSourceAccess_workspaceId_sourceId_sourceType_idx" ON "TelegramChannelSourceAccess"("workspaceId", "sourceId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelSourceAccess_channelId_sourceId_sourceType_key" ON "TelegramChannelSourceAccess"("channelId", "sourceId", "sourceType");

-- CreateIndex
CREATE INDEX "TelegramChannelDataSource_workspaceId_channelId_idx" ON "TelegramChannelDataSource"("workspaceId", "channelId");

-- CreateIndex
CREATE INDEX "TelegramChannelDataSource_workspaceId_sourceId_sourceType_idx" ON "TelegramChannelDataSource"("workspaceId", "sourceId", "sourceType");

-- CreateIndex
CREATE INDEX "TelegramChannelDataSource_workspaceId_channelId_dataType_idx" ON "TelegramChannelDataSource"("workspaceId", "channelId", "dataType");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_telegramUsername_key" ON "WorkspaceMember"("workspaceId", "telegramUsername");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_id_workspaceId_key" ON "WorkspaceMember"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "Account_workspaceId_assignedMemberId_idx" ON "Account"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_adCampaignId_key" ON "Transaction"("adCampaignId");

-- CreateIndex
CREATE INDEX "Transaction_workspaceId_type_categoryId_idx" ON "Transaction"("workspaceId", "type", "categoryId");

-- CreateIndex
CREATE INDEX "Transaction_workspaceId_memberId_idx" ON "Transaction"("workspaceId", "memberId");

-- CreateIndex
CREATE INDEX "Transaction_workspaceId_assignedMemberId_idx" ON "Transaction"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "Transaction_workspaceId_telegramChannelId_idx" ON "Transaction"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE INDEX "TransactionCategory_workspaceId_type_idx" ON "TransactionCategory"("workspaceId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCategory_workspaceId_type_key_key" ON "TransactionCategory"("workspaceId", "type", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Investment_transactionId_key" ON "Investment"("transactionId");

-- CreateIndex
CREATE INDEX "Investment_workspaceId_assignedMemberId_idx" ON "Investment"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "Transfer_workspaceId_assignedMemberId_idx" ON "Transfer"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannel_purchaseTransactionId_key" ON "TelegramChannel"("purchaseTransactionId");

-- CreateIndex
CREATE INDEX "TelegramChannel_workspaceId_username_idx" ON "TelegramChannel"("workspaceId", "username");

-- CreateIndex
CREATE INDEX "TelegramChannel_workspaceId_telegramChatId_idx" ON "TelegramChannel"("workspaceId", "telegramChatId");

-- CreateIndex
CREATE INDEX "TelegramChannel_workspaceId_assignedMemberId_idx" ON "TelegramChannel"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "TelegramChannel_workspaceId_isActive_autoSyncEnabled_idx" ON "TelegramChannel"("workspaceId", "isActive", "autoSyncEnabled");

-- CreateIndex
CREATE INDEX "TelegramCustomEmojiPack_workspaceId_updatedAt_idx" ON "TelegramCustomEmojiPack"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramCustomEmojiPack_workspaceId_shortName_key" ON "TelegramCustomEmojiPack"("workspaceId", "shortName");

-- CreateIndex
CREATE INDEX "TelegramCustomEmoji_packId_position_idx" ON "TelegramCustomEmoji"("packId", "position");

-- CreateIndex
CREATE INDEX "TelegramCustomEmoji_documentId_idx" ON "TelegramCustomEmoji"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramCustomEmoji_packId_documentId_key" ON "TelegramCustomEmoji"("packId", "documentId");

-- CreateIndex
CREATE INDEX "TelegramChannelCustomEmojiPack_packId_idx" ON "TelegramChannelCustomEmojiPack"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelCustomEmojiPack_channelId_packId_key" ON "TelegramChannelCustomEmojiPack"("channelId", "packId");

-- CreateIndex
CREATE INDEX "TelegramChannelTimePost_telegramChannelId_position_idx" ON "TelegramChannelTimePost"("telegramChannelId", "position");

-- CreateIndex
CREATE INDEX "TelegramChannelTimePost_iconId_idx" ON "TelegramChannelTimePost"("iconId");

-- CreateIndex
CREATE INDEX "TelegramChannelAdAnalysis_workspaceId_telegramChannelId_idx" ON "TelegramChannelAdAnalysis"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE INDEX "TelegramChannelAdAnalysis_workspaceId_analyzedAt_idx" ON "TelegramChannelAdAnalysis"("workspaceId", "analyzedAt");

-- CreateIndex
CREATE INDEX "TelegramChannelAdAnalysis_workspaceId_status_idx" ON "TelegramChannelAdAnalysis"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "TelegramChannelAdAnalysis_workspaceId_assignedMemberId_idx" ON "TelegramChannelAdAnalysis"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelDailyStats_telegramChannelId_date_key" ON "TelegramChannelDailyStats"("telegramChannelId", "date");

-- CreateIndex
CREATE INDEX "TelegramChannelStatsSnapshot_workspaceId_telegramChannelId_sync" ON "TelegramChannelStatsSnapshot"("workspaceId", "telegramChannelId", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelStatsSnapshot_telegramChannelId_snapshotDate_key" ON "TelegramChannelStatsSnapshot"("telegramChannelId", "snapshotDate");

-- CreateIndex
CREATE INDEX "TelegramChannelStatsPoint_workspaceId_telegramChannelId_date_id" ON "TelegramChannelStatsPoint"("workspaceId", "telegramChannelId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelStatsPoint_telegramChannelId_metric_series_date_" ON "TelegramChannelStatsPoint"("telegramChannelId", "metric", "series", "date");

-- CreateIndex
CREATE INDEX "TelegramChannelAudienceSnapshot_workspaceId_telegramChannelId_c" ON "TelegramChannelAudienceSnapshot"("workspaceId", "telegramChannelId", "collectedAt");

-- CreateIndex
CREATE INDEX "TelegramChannelAudienceSnapshot_telegramChannelId_collectedAt_i" ON "TelegramChannelAudienceSnapshot"("telegramChannelId", "collectedAt");

-- CreateIndex
CREATE INDEX "TelegramChannelNetwork_workspaceId_idx" ON "TelegramChannelNetwork"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramChannelNetwork_workspaceId_assignedMemberId_idx" ON "TelegramChannelNetwork"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelNetwork_workspaceId_name_key" ON "TelegramChannelNetwork"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "TelegramChannelNetworkMember_workspaceId_idx" ON "TelegramChannelNetworkMember"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramChannelNetworkMember_networkId_idx" ON "TelegramChannelNetworkMember"("networkId");

-- CreateIndex
CREATE INDEX "TelegramChannelNetworkMember_telegramChannelId_idx" ON "TelegramChannelNetworkMember"("telegramChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelNetworkMember_networkId_telegramChannelId_key" ON "TelegramChannelNetworkMember"("networkId", "telegramChannelId");

-- CreateIndex
CREATE INDEX "TelegramAdProduct_workspaceId_idx" ON "TelegramAdProduct"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAdProduct_telegramChannelId_isActive_position_idx" ON "TelegramAdProduct"("telegramChannelId", "isActive", "position");

-- CreateIndex
CREATE INDEX "TelegramAdProduct_workspaceId_telegramChannelId_idx" ON "TelegramAdProduct"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdProduct_workspaceId_telegramChannelId_name_key" ON "TelegramAdProduct"("workspaceId", "telegramChannelId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSchedulePolicy_telegramChannelId_key" ON "TelegramAdSchedulePolicy"("telegramChannelId");

-- CreateIndex
CREATE INDEX "TelegramAdSchedulePolicy_workspaceId_idx" ON "TelegramAdSchedulePolicy"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAdSchedulePolicy_workspaceId_telegramChannelId_idx" ON "TelegramAdSchedulePolicy"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSalesMemberPreferences_workspaceMemberId_key" ON "TelegramAdSalesMemberPreferences"("workspaceMemberId");

-- CreateIndex
CREATE INDEX "TelegramAdSalesMemberPreferences_workspaceId_idx" ON "TelegramAdSalesMemberPreferences"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAdPriceSnapshot_workspaceId_idx" ON "TelegramAdPriceSnapshot"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAdPriceSnapshot_telegramChannelId_calculatedAt_idx" ON "TelegramAdPriceSnapshot"("telegramChannelId", "calculatedAt");

-- CreateIndex
CREATE INDEX "TelegramAdPriceSnapshot_telegramAdProductId_calculatedAt_idx" ON "TelegramAdPriceSnapshot"("telegramAdProductId", "calculatedAt");

-- CreateIndex
CREATE INDEX "tg_ad_inv_daily_ws_date_idx" ON "TelegramAdInventoryDailySnapshot"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "tg_ad_inv_daily_channel_date_idx" ON "TelegramAdInventoryDailySnapshot"("telegramChannelId", "date");

-- CreateIndex
CREATE INDEX "tg_ad_inv_daily_ws_channel_date_idx" ON "TelegramAdInventoryDailySnapshot"("workspaceId", "telegramChannelId", "date");

-- CreateIndex
CREATE INDEX "tg_ad_inv_daily_date_eligible_idx" ON "TelegramAdInventoryDailySnapshot"("date", "eligibleSlots");

-- CreateIndex
CREATE INDEX "tg_ad_inv_daily_date_booked_idx" ON "TelegramAdInventoryDailySnapshot"("date", "bookedSlots");

-- CreateIndex
CREATE UNIQUE INDEX "tg_ad_inv_daily_ws_channel_date_key" ON "TelegramAdInventoryDailySnapshot"("workspaceId", "telegramChannelId", "date");

-- CreateIndex
CREATE INDEX "TelegramAdSale_workspaceId_idx" ON "TelegramAdSale"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAdSale_workspaceId_status_createdAt_idx" ON "TelegramAdSale"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramAdSale_workspaceId_assignedMemberId_idx" ON "TelegramAdSale"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "TelegramAdSale_workspaceId_advertiserId_createdAt_idx" ON "TelegramAdSale"("workspaceId", "advertiserId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramAdSale_workspaceId_crmDealStage_createdAt_idx" ON "TelegramAdSale"("workspaceId", "crmDealStage", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramAdSale_sourceTaskId_idx" ON "TelegramAdSale"("sourceTaskId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_workspaceId_idx" ON "TelegramAdSalePlacement"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_telegramChannelId_scheduledAt_idx" ON "TelegramAdSalePlacement"("telegramChannelId", "scheduledAt");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_telegramAdSaleId_idx" ON "TelegramAdSalePlacement"("telegramAdSaleId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_status_scheduledAt_idx" ON "TelegramAdSalePlacement"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_workspaceId_status_scheduledAt_idx" ON "TelegramAdSalePlacement"("workspaceId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_telegramChannelNetworkId_idx" ON "TelegramAdSalePlacement"("telegramChannelNetworkId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_telegramAdProductId_idx" ON "TelegramAdSalePlacement"("telegramAdProductId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_pricingSnapshotId_idx" ON "TelegramAdSalePlacement"("pricingSnapshotId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_workspaceId_publishedAt_idx" ON "TelegramAdSalePlacement"("workspaceId", "publishedAt");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_workspaceId_plannedDeleteAt_deletedAt_i" ON "TelegramAdSalePlacement"("workspaceId", "plannedDeleteAt", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSalePlacement_workspaceId_telegramChannelId_inventory" ON "TelegramAdSalePlacement"("workspaceId", "telegramChannelId", "inventoryOpportunityKey");

-- CreateIndex
CREATE INDEX "TelegramAdvertiser_workspaceId_status_updatedAt_idx" ON "TelegramAdvertiser"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TelegramAdvertiser_workspaceId_lifecycleStage_updatedAt_idx" ON "TelegramAdvertiser"("workspaceId", "lifecycleStage", "updatedAt");

-- CreateIndex
CREATE INDEX "TelegramAdvertiser_workspaceId_ownerMemberId_idx" ON "TelegramAdvertiser"("workspaceId", "ownerMemberId");

-- CreateIndex
CREATE INDEX "TelegramAdvertiser_workspaceId_lastPurchaseAt_idx" ON "TelegramAdvertiser"("workspaceId", "lastPurchaseAt");

-- CreateIndex
CREATE INDEX "TelegramAdvertiser_workspaceId_nextContactAt_idx" ON "TelegramAdvertiser"("workspaceId", "nextContactAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdvertiser_workspaceId_displayName_key" ON "TelegramAdvertiser"("workspaceId", "displayName");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserContact_workspaceId_advertiserId_type_idx" ON "TelegramAdvertiserContact"("workspaceId", "advertiserId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdvertiserContact_workspaceId_type_normalizedValue_key" ON "TelegramAdvertiserContact"("workspaceId", "type", "normalizedValue");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserTag_workspaceId_position_idx" ON "TelegramAdvertiserTag"("workspaceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdvertiserTag_workspaceId_name_key" ON "TelegramAdvertiserTag"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserTagAssignment_workspaceId_tagId_idx" ON "TelegramAdvertiserTagAssignment"("workspaceId", "tagId");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserActivity_workspaceId_advertiserId_occurredAt_" ON "TelegramAdvertiserActivity"("workspaceId", "advertiserId", "occurredAt");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserActivity_workspaceId_type_occurredAt_idx" ON "TelegramAdvertiserActivity"("workspaceId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserTask_workspaceId_assignedMemberId_status_dueA" ON "TelegramAdvertiserTask"("workspaceId", "assignedMemberId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserTask_workspaceId_advertiserId_dueAt_idx" ON "TelegramAdvertiserTask"("workspaceId", "advertiserId", "dueAt");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserTask_workspaceId_status_dueAt_idx" ON "TelegramAdvertiserTask"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdCrmMemberSettings_workspaceMemberId_key" ON "TelegramAdCrmMemberSettings"("workspaceMemberId");

-- CreateIndex
CREATE INDEX "TelegramAdCrmMemberSettings_workspaceId_idx" ON "TelegramAdCrmMemberSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserAutomationRule_workspaceId_eventType_isActive" ON "TelegramAdvertiserAutomationRule"("workspaceId", "eventType", "isActive");

-- CreateIndex
CREATE INDEX "TelegramAdvertiserAutomationExecution_workspaceId_executedAt_id" ON "TelegramAdvertiserAutomationExecution"("workspaceId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdvertiserAutomationExecution_automationRuleId_eventKey" ON "TelegramAdvertiserAutomationExecution"("automationRuleId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdPlacementAdvertiserResult_placementId_key" ON "TelegramAdPlacementAdvertiserResult"("placementId");

-- CreateIndex
CREATE INDEX "TelegramAdPlacementAdvertiserResult_workspaceId_reportedAt_idx" ON "TelegramAdPlacementAdvertiserResult"("workspaceId", "reportedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSalePayment_transactionId_key" ON "TelegramAdSalePayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSalePayment_reversalTransactionId_key" ON "TelegramAdSalePayment"("reversalTransactionId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePayment_workspaceId_idx" ON "TelegramAdSalePayment"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePayment_telegramAdSaleId_paidAt_idx" ON "TelegramAdSalePayment"("telegramAdSaleId", "paidAt");

-- CreateIndex
CREATE INDEX "TelegramAdSalePayment_accountId_paidAt_idx" ON "TelegramAdSalePayment"("accountId", "paidAt");

-- CreateIndex
CREATE INDEX "TelegramAdSalePayment_workspaceId_status_paidAt_idx" ON "TelegramAdSalePayment"("workspaceId", "status", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSalePayment_workspaceId_idempotencyKey_key" ON "TelegramAdSalePayment"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TelegramAdSalePaymentAllocation_workspaceId_idx" ON "TelegramAdSalePaymentAllocation"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePaymentAllocation_telegramAdSalePaymentId_idx" ON "TelegramAdSalePaymentAllocation"("telegramAdSalePaymentId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePaymentAllocation_telegramAdSalePlacementId_idx" ON "TelegramAdSalePaymentAllocation"("telegramAdSalePlacementId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSalePaymentAllocation_telegramAdSalePaymentId_telegra" ON "TelegramAdSalePaymentAllocation"("telegramAdSalePaymentId", "telegramAdSalePlacementId");

-- CreateIndex
CREATE INDEX "Promo_workspaceId_assignedMemberId_idx" ON "Promo"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "Promo_iconId_idx" ON "Promo"("iconId");

-- CreateIndex
CREATE INDEX "AdCampaignPromo_promoId_idx" ON "AdCampaignPromo"("promoId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaignPromo_adCampaignId_promoId_key" ON "AdCampaignPromo"("adCampaignId", "promoId");

-- CreateIndex
CREATE INDEX "AdvertisingSource_workspaceId_assignedMemberId_idx" ON "AdvertisingSource"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "AdCampaign_workspaceId_assignedMemberId_idx" ON "AdCampaign"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaignAdmissionBatch_batchFingerprint_key" ON "AdCampaignAdmissionBatch"("batchFingerprint");

-- CreateIndex
CREATE INDEX "AdCampaignAdmissionBatch_workspaceId_status_idx" ON "AdCampaignAdmissionBatch"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AdCampaignAdmissionBatch_workspaceId_adCampaignId_status_idx" ON "AdCampaignAdmissionBatch"("workspaceId", "adCampaignId", "status");

-- CreateIndex
CREATE INDEX "AdmissionBatch_workspace_channel_started_idx" ON "AdCampaignAdmissionBatch"("workspaceId", "telegramChannelId", "startedAt");

-- CreateIndex
CREATE INDEX "AdCampaignAdmissionBatch_adCampaignId_status_idx" ON "AdCampaignAdmissionBatch"("adCampaignId", "status");

-- CreateIndex
CREATE INDEX "AdCampaignAdmissionBatch_telegramChannelId_startedAt_idx" ON "AdCampaignAdmissionBatch"("telegramChannelId", "startedAt");

-- CreateIndex
CREATE INDEX "AdCampaignAdmissionBatch_startedAt_idx" ON "AdCampaignAdmissionBatch"("startedAt");

-- CreateIndex
CREATE INDEX "AdCampaignAdmissionViewSnapshot_batchId_collectedAt_idx" ON "AdCampaignAdmissionViewSnapshot"("batchId", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionViewSnapshot_batch_metric_key" ON "AdCampaignAdmissionViewSnapshot"("batchId", "sourceMetricCollectedAt");

-- CreateIndex
CREATE INDEX "AdmissionBackfillState_workspace_channel_idx" ON "AdCampaignAdmissionBackfillState"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionBackfillState_workspace_channel_version_key" ON "AdCampaignAdmissionBackfillState"("workspaceId", "telegramChannelId", "version");

-- CreateIndex
CREATE INDEX "AdHypothesis_workspaceId_idx" ON "AdHypothesis"("workspaceId");

-- CreateIndex
CREATE INDEX "AdHypothesis_workspaceId_status_idx" ON "AdHypothesis"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AdHypothesis_iconId_idx" ON "AdHypothesis"("iconId");

-- CreateIndex
CREATE INDEX "AdHypothesis_telegramChannelId_idx" ON "AdHypothesis"("telegramChannelId");

-- CreateIndex
CREATE INDEX "AdHypothesis_workspaceId_assignedMemberId_idx" ON "AdHypothesis"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "AdHypothesis_workspaceId_name_key" ON "AdHypothesis"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "AdHypothesisCampaign_workspaceId_idx" ON "AdHypothesisCampaign"("workspaceId");

-- CreateIndex
CREATE INDEX "AdHypothesisCampaign_hypothesisId_idx" ON "AdHypothesisCampaign"("hypothesisId");

-- CreateIndex
CREATE INDEX "AdHypothesisCampaign_adCampaignId_idx" ON "AdHypothesisCampaign"("adCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdHypothesisCampaign_hypothesisId_adCampaignId_key" ON "AdHypothesisCampaign"("hypothesisId", "adCampaignId");

-- CreateIndex
CREATE INDEX "DailyAnalyticsSyncRun_workspaceId_startedAt_idx" ON "DailyAnalyticsSyncRun"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "DailyAnalyticsSyncRun_status_idx" ON "DailyAnalyticsSyncRun"("status");

-- CreateIndex
CREATE INDEX "DailyAnalyticsSyncRun_source_idx" ON "DailyAnalyticsSyncRun"("source");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTaskConfig_lockKey_key" ON "ScheduledTaskConfig"("lockKey");

-- CreateIndex
CREATE INDEX "ScheduledTaskConfig_workspaceId_taskKey_idx" ON "ScheduledTaskConfig"("workspaceId", "taskKey");

-- CreateIndex
CREATE INDEX "ScheduledTaskConfig_taskKey_idx" ON "ScheduledTaskConfig"("taskKey");

-- CreateIndex
CREATE INDEX "ScheduledTaskConfig_scope_idx" ON "ScheduledTaskConfig"("scope");

-- CreateIndex
CREATE INDEX "ScheduledTaskConfig_enabled_idx" ON "ScheduledTaskConfig"("enabled");

-- CreateIndex
CREATE INDEX "ScheduledTaskConfig_enabled_nextScheduledRunAt_idx" ON "ScheduledTaskConfig"("enabled", "nextScheduledRunAt");

-- CreateIndex
CREATE INDEX "ScheduledTaskConfig_scheduledClaimExpiresAt_idx" ON "ScheduledTaskConfig"("scheduledClaimExpiresAt");

-- CreateIndex
CREATE INDEX "ScheduledTaskRun_workspaceId_taskKey_startedAt_idx" ON "ScheduledTaskRun"("workspaceId", "taskKey", "startedAt");

-- CreateIndex
CREATE INDEX "ScheduledTaskRun_taskKey_startedAt_idx" ON "ScheduledTaskRun"("taskKey", "startedAt");

-- CreateIndex
CREATE INDEX "ScheduledTaskRun_status_idx" ON "ScheduledTaskRun"("status");

-- CreateIndex
CREATE INDEX "ScheduledTaskRun_trigger_idx" ON "ScheduledTaskRun"("trigger");

-- CreateIndex
CREATE INDEX "ScheduledTaskRun_status_finishedAt_idx" ON "ScheduledTaskRun"("status", "finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTaskRun_scheduledTaskConfigId_scheduledFor_key" ON "ScheduledTaskRun"("scheduledTaskConfigId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTaskLease_lockKey_key" ON "ScheduledTaskLease"("lockKey");

-- CreateIndex
CREATE INDEX "ScheduledTaskLease_workspaceId_taskKey_idx" ON "ScheduledTaskLease"("workspaceId", "taskKey");

-- CreateIndex
CREATE INDEX "ScheduledTaskLease_expiresAt_idx" ON "ScheduledTaskLease"("expiresAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_workspaceId_createdAt_idx" ON "ApplicationLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_level_createdAt_idx" ON "ApplicationLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_kind_createdAt_idx" ON "ApplicationLog"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_source_createdAt_idx" ON "ApplicationLog"("source", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_event_createdAt_idx" ON "ApplicationLog"("event", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_correlationId_idx" ON "ApplicationLog"("correlationId");

-- CreateIndex
CREATE INDEX "ApplicationLog_statusCode_createdAt_idx" ON "ApplicationLog"("statusCode", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_expiresAt_idx" ON "ApplicationLog"("expiresAt");

-- CreateIndex
CREATE INDEX "AdCampaignAdvertisingChannel_advertisingSourceId_idx" ON "AdCampaignAdvertisingChannel"("advertisingSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaignAdvertisingChannel_adCampaignId_advertisingSourceId_k" ON "AdCampaignAdvertisingChannel"("adCampaignId", "advertisingSourceId");

-- CreateIndex
CREATE INDEX "AdCampaignTelegramChannelPlacement_telegramChannelId_idx" ON "AdCampaignTelegramChannelPlacement"("telegramChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaignTelegramChannelPlacement_adCampaignId_telegramChannel" ON "AdCampaignTelegramChannelPlacement"("adCampaignId", "telegramChannelId");

-- CreateIndex
CREATE INDEX "TelegramInviteLink_workspaceId_creatorTelegramUserId_idx" ON "TelegramInviteLink"("workspaceId", "creatorTelegramUserId");

-- CreateIndex
CREATE INDEX "TelegramInviteLink_workspaceId_creatorMemberId_idx" ON "TelegramInviteLink"("workspaceId", "creatorMemberId");

-- CreateIndex
CREATE INDEX "TelegramInviteLink_telegramChannelId_isRevoked_idx" ON "TelegramInviteLink"("telegramChannelId", "isRevoked");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramInviteLink_workspaceId_telegramChannelId_url_key" ON "TelegramInviteLink"("workspaceId", "telegramChannelId", "url");

-- CreateIndex
CREATE INDEX "TelegramInviteLinkSnapshot_workspaceId_telegramChannelId_synced" ON "TelegramInviteLinkSnapshot"("workspaceId", "telegramChannelId", "syncedAt");

-- CreateIndex
CREATE INDEX "TelegramInviteLinkSnapshot_workspaceId_adCampaignId_syncedAt_id" ON "TelegramInviteLinkSnapshot"("workspaceId", "adCampaignId", "syncedAt");

-- CreateIndex
CREATE INDEX "TelegramInviteLinkSnapshot_workspaceId_inviteLinkId_syncedAt_id" ON "TelegramInviteLinkSnapshot"("workspaceId", "inviteLinkId", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramInviteLinkSnapshot_inviteLinkId_syncedAt_key" ON "TelegramInviteLinkSnapshot"("inviteLinkId", "syncedAt");

-- CreateIndex
CREATE INDEX "TelegramBotIntegration_workspaceId_assignedMemberId_idx" ON "TelegramBotIntegration"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "TelegramBotIntegration_workspaceId_applicationType_idx" ON "TelegramBotIntegration"("workspaceId", "applicationType");

-- CreateIndex
CREATE INDEX "TelegramBotIntegration_runtimeStatus_idx" ON "TelegramBotIntegration"("runtimeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBotIntegration_id_workspaceId_key" ON "TelegramBotIntegration"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "TelegramBotApplicationWorkspaceAccess_applicationType_enabled_i" ON "TelegramBotApplicationWorkspaceAccess"("applicationType", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBotApplicationWorkspaceAccess_workspaceId_applicationTy" ON "TelegramBotApplicationWorkspaceAccess"("workspaceId", "applicationType");

-- CreateIndex
CREATE INDEX "TelegramBotUser_workspaceId_botIntegrationId_idx" ON "TelegramBotUser"("workspaceId", "botIntegrationId");

-- CreateIndex
CREATE INDEX "TelegramBotUser_telegramChatId_idx" ON "TelegramBotUser"("telegramChatId");

-- CreateIndex
CREATE INDEX "TelegramBotUser_blockedAt_idx" ON "TelegramBotUser"("blockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBotUser_botIntegrationId_telegramUserId_key" ON "TelegramBotUser"("botIntegrationId", "telegramUserId");

-- CreateIndex
CREATE INDEX "TelegramBotUpdateLog_workspaceId_botIntegrationId_receivedAt_id" ON "TelegramBotUpdateLog"("workspaceId", "botIntegrationId", "receivedAt");

-- CreateIndex
CREATE INDEX "TelegramBotUpdateLog_status_receivedAt_idx" ON "TelegramBotUpdateLog"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBotUpdateLog_botIntegrationId_updateId_key" ON "TelegramBotUpdateLog"("botIntegrationId", "updateId");

-- CreateIndex
CREATE INDEX "TelegramBotDelivery_status_scheduledAt_idx" ON "TelegramBotDelivery"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "TelegramBotDelivery_lockedUntil_idx" ON "TelegramBotDelivery"("lockedUntil");

-- CreateIndex
CREATE INDEX "TelegramBotDelivery_workspaceId_botIntegrationId_idx" ON "TelegramBotDelivery"("workspaceId", "botIntegrationId");

-- CreateIndex
CREATE INDEX "TelegramBotDelivery_financeReminderId_idx" ON "TelegramBotDelivery"("financeReminderId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBotDelivery_botIntegrationId_idempotencyKey_key" ON "TelegramBotDelivery"("botIntegrationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterConfig_botIntegrationId_key" ON "GreeterConfig"("botIntegrationId");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterConfig_currentPublishedVersionId_key" ON "GreeterConfig"("currentPublishedVersionId");

-- CreateIndex
CREATE INDEX "GreeterConfig_workspaceId_idx" ON "GreeterConfig"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterConfig_botIntegrationId_workspaceId_key" ON "GreeterConfig"("botIntegrationId", "workspaceId");

-- CreateIndex
CREATE INDEX "GreeterConfigVersion_workspaceId_botIntegrationId_revision_idx" ON "GreeterConfigVersion"("workspaceId", "botIntegrationId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterConfigVersion_configId_revision_key" ON "GreeterConfigVersion"("configId", "revision");

-- CreateIndex
CREATE INDEX "GreeterChannel_workspaceId_channelId_idx" ON "GreeterChannel"("workspaceId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterChannel_botIntegrationId_channelId_key" ON "GreeterChannel"("botIntegrationId", "channelId");

-- CreateIndex
CREATE INDEX "GreeterChannelConfigVersion_workspace_bot_channel_idx" ON "GreeterChannelConfigVersion"("workspaceId", "botIntegrationId", "greeterChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterChannelConfigVersion_configVersionId_channel_key" ON "GreeterChannelConfigVersion"("configVersionId", "greeterChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterJoinRequest_captchaDeliveryId_key" ON "GreeterJoinRequest"("captchaDeliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterJoinRequest_outcomeDeliveryId_key" ON "GreeterJoinRequest"("outcomeDeliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterJoinRequest_callbackToken_key" ON "GreeterJoinRequest"("callbackToken");

-- CreateIndex
CREATE INDEX "GreeterJoinRequest_workspaceId_botIntegrationId_status_idx" ON "GreeterJoinRequest"("workspaceId", "botIntegrationId", "status");

-- CreateIndex
CREATE INDEX "GreeterJoinRequest_workspace_bot_environment_status_idx" ON "GreeterJoinRequest"("workspaceId", "botIntegrationId", "environment", "status");

-- CreateIndex
CREATE INDEX "GreeterJoinRequest_testSessionId_testGeneration_idx" ON "GreeterJoinRequest"("testSessionId", "testGeneration");

-- CreateIndex
CREATE INDEX "GreeterJoinRequest_workspaceId_botIntegrationId_requestedAt_idx" ON "GreeterJoinRequest"("workspaceId", "botIntegrationId", "requestedAt");

-- CreateIndex
CREATE INDEX "GreeterJoinRequest_botIntegrationId_channelId_requestedAt_idx" ON "GreeterJoinRequest"("botIntegrationId", "channelId", "requestedAt");

-- CreateIndex
CREATE INDEX "GreeterJoinRequest_telegramBotUserId_requestedAt_idx" ON "GreeterJoinRequest"("telegramBotUserId", "requestedAt");

-- CreateIndex
CREATE INDEX "GreeterJoinRequest_expiredAt_idx" ON "GreeterJoinRequest"("expiredAt");

-- CreateIndex
CREATE INDEX "GreeterJoinRequest_status_expiredAt_expiryClaimUntil_idx" ON "GreeterJoinRequest"("status", "expiredAt", "expiryClaimUntil");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterJoinRequest_botIntegrationId_channelId_telegramUserId_re" ON "GreeterJoinRequest"("botIntegrationId", "channelId", "telegramUserId", "requestedAt");

-- CreateIndex
CREATE INDEX "GreeterSequence_workspaceId_botIntegrationId_idx" ON "GreeterSequence"("workspaceId", "botIntegrationId");

-- CreateIndex
CREATE INDEX "GreeterSequence_workspace_bot_trigger_channel_idx" ON "GreeterSequence"("workspaceId", "botIntegrationId", "trigger", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterSequenceVersion_sequenceId_version_key" ON "GreeterSequenceVersion"("sequenceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterSequenceVersion_sequence_status_source_revision_key" ON "GreeterSequenceVersion"("sequenceId", "status", "sourceDraftRevision");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterSequenceStep_sequenceId_position_key" ON "GreeterSequenceStep"("sequenceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterSequenceStep_versionId_position_key" ON "GreeterSequenceStep"("versionId", "position");

-- CreateIndex
CREATE INDEX "GreeterSequenceEnrollment_workspaceId_botIntegrationId_envi_idx" ON "GreeterSequenceEnrollment"("workspaceId", "botIntegrationId", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterSequenceEnrollment_logical_run_key" ON "GreeterSequenceEnrollment"("sequenceId", "telegramBotUserId", "environment", "logicalScopeKey", "runKey");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterSequenceStepExecution_deliveryId_key" ON "GreeterSequenceStepExecution"("deliveryId");

-- CreateIndex
CREATE INDEX "GreeterSequenceStepExecution_status_dueAt_idx" ON "GreeterSequenceStepExecution"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterSequenceStepExecution_enrollmentId_stepId_key" ON "GreeterSequenceStepExecution"("enrollmentId", "stepId");

-- CreateIndex
CREATE INDEX "GreeterBroadcast_workspaceId_botIntegrationId_status_idx" ON "GreeterBroadcast"("workspaceId", "botIntegrationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterBroadcastRecipient_deliveryId_key" ON "GreeterBroadcastRecipient"("deliveryId");

-- CreateIndex
CREATE INDEX "GreeterBroadcastRecipient_broadcastId_status_idx" ON "GreeterBroadcastRecipient"("broadcastId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterBroadcastRecipient_broadcastId_telegramBotUserId_key" ON "GreeterBroadcastRecipient"("broadcastId", "telegramBotUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterTestSession_botIntegrationId_key" ON "GreeterTestSession"("botIntegrationId");

-- CreateIndex
CREATE INDEX "GreeterTestSession_workspaceId_botIntegrationId_idx" ON "GreeterTestSession"("workspaceId", "botIntegrationId");

-- CreateIndex
CREATE INDEX "GreeterUserEnvironmentState_workspace_bot_environment_idx" ON "GreeterUserEnvironmentState"("workspaceId", "botIntegrationId", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "GreeterUserEnvironmentState_bot_user_env_generation_key" ON "GreeterUserEnvironmentState"("botIntegrationId", "telegramBotUserId", "environment", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceProfile_botIntegrationId_telegramBotUserId_key" ON "FinanceProfile"("botIntegrationId", "telegramBotUserId");

-- CreateIndex
CREATE INDEX "FinanceAiProviderConfig_workspaceId_provider_idx" ON "FinanceAiProviderConfig"("workspaceId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAiProviderConfig_workspaceId_botIntegrationId_provider_k" ON "FinanceAiProviderConfig"("workspaceId", "botIntegrationId", "provider");

-- CreateIndex
CREATE INDEX "FinanceAccount_profileId_archivedAt_idx" ON "FinanceAccount"("profileId", "archivedAt");

-- CreateIndex
CREATE INDEX "FinanceCategory_profileId_parentId_idx" ON "FinanceCategory"("profileId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_profileId_type_key_key" ON "FinanceCategory"("profileId", "type", "key");

-- CreateIndex
CREATE INDEX "FinanceTransaction_profileId_occurredAt_idx" ON "FinanceTransaction"("profileId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceTransaction_profileId_accountId_occurredAt_idx" ON "FinanceTransaction"("profileId", "accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceTransaction_profileId_categoryId_occurredAt_idx" ON "FinanceTransaction"("profileId", "categoryId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceTransfer_profileId_occurredAt_idx" ON "FinanceTransfer"("profileId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceMerchantMapping_profileId_merchantNormalized_key" ON "FinanceMerchantMapping"("profileId", "merchantNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSpendingLimit_profileId_categoryId_period_key" ON "FinanceSpendingLimit"("profileId", "categoryId", "period");

-- CreateIndex
CREATE INDEX "FinanceReminder_enabled_nextOccurrenceAt_idx" ON "FinanceReminder"("enabled", "nextOccurrenceAt");

-- CreateIndex
CREATE INDEX "FinanceGoal_profileId_active_idx" ON "FinanceGoal"("profileId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePendingProposal_tokenHash_key" ON "FinancePendingProposal"("tokenHash");

-- CreateIndex
CREATE INDEX "FinancePendingProposal_botIntegrationId_telegramBotUserId_statu" ON "FinancePendingProposal"("botIntegrationId", "telegramBotUserId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssistantProfile_profileId_key" ON "FinanceAssistantProfile"("profileId");

-- CreateIndex
CREATE INDEX "FinanceAiUsage_profileId_createdAt_feature_idx" ON "FinanceAiUsage"("profileId", "createdAt", "feature");

-- CreateIndex
CREATE INDEX "BotBillingProviderConfig_workspaceId_provider_mode_idx" ON "BotBillingProviderConfig"("workspaceId", "provider", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "BotBillingProviderConfig_workspaceId_botIntegrationId_provider_" ON "BotBillingProviderConfig"("workspaceId", "botIntegrationId", "provider", "mode");

-- CreateIndex
CREATE INDEX "BotSubscriptionPlan_workspaceId_botIntegrationId_isActive_idx" ON "BotSubscriptionPlan"("workspaceId", "botIntegrationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BotSubscriptionPlan_botIntegrationId_code_key" ON "BotSubscriptionPlan"("botIntegrationId", "code");

-- CreateIndex
CREATE INDEX "BotPlanPrice_planId_currency_interval_isPublic_isActive_idx" ON "BotPlanPrice"("planId", "currency", "interval", "isPublic", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BotPlanPrice_planId_currency_interval_version_key" ON "BotPlanPrice"("planId", "currency", "interval", "version");

-- CreateIndex
CREATE INDEX "BotSubscription_workspaceId_botIntegrationId_status_idx" ON "BotSubscription"("workspaceId", "botIntegrationId", "status");

-- CreateIndex
CREATE INDEX "BotSubscription_telegramBotUserId_status_currentPeriodEnd_idx" ON "BotSubscription"("telegramBotUserId", "status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "BotSubscription_providerSubscriptionId_idx" ON "BotSubscription"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BotSubscriptionGrant_idempotencyKey_key" ON "BotSubscriptionGrant"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BotSubscriptionGrant_subscriptionId_expiresAt_revokedAt_idx" ON "BotSubscriptionGrant"("subscriptionId", "expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "BotCoupon_workspaceId_botIntegrationId_isActive_idx" ON "BotCoupon"("workspaceId", "botIntegrationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BotCoupon_botIntegrationId_code_key" ON "BotCoupon"("botIntegrationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BotCouponRedemption_idempotencyKey_key" ON "BotCouponRedemption"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BotCouponRedemption_couponId_createdAt_idx" ON "BotCouponRedemption"("couponId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BotCouponRedemption_couponId_telegramBotUserId_planPriceId_key" ON "BotCouponRedemption"("couponId", "telegramBotUserId", "planPriceId");

-- CreateIndex
CREATE UNIQUE INDEX "BotProviderCustomer_provider_mode_providerCustomerId_key" ON "BotProviderCustomer"("provider", "mode", "providerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "BotProviderCustomer_botIntegrationId_telegramBotUserId_provider" ON "BotProviderCustomer"("botIntegrationId", "telegramBotUserId", "provider", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "BotProviderSubscription_subscriptionId_key" ON "BotProviderSubscription"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BotProviderSubscription_provider_mode_providerSubscriptionId_ke" ON "BotProviderSubscription"("provider", "mode", "providerSubscriptionId");

-- CreateIndex
CREATE INDEX "BotBillingEvent_workspaceId_botIntegrationId_occurredAt_idx" ON "BotBillingEvent"("workspaceId", "botIntegrationId", "occurredAt");

-- CreateIndex
CREATE INDEX "BotBillingEvent_subscriptionId_occurredAt_idx" ON "BotBillingEvent"("subscriptionId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BotBillingEvent_provider_mode_providerEventId_key" ON "BotBillingEvent"("provider", "mode", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemBotLinkToken_tokenHash_key" ON "SystemBotLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SystemBotLinkToken_telegramUserId_expiresAt_idx" ON "SystemBotLinkToken"("telegramUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "SystemBotLinkToken_expiresAt_idx" ON "SystemBotLinkToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSystemBotConnection_userId_key" ON "TelegramSystemBotConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSystemBotConnection_telegramUserId_key" ON "TelegramSystemBotConnection"("telegramUserId");

-- CreateIndex
CREATE INDEX "TelegramSystemBotConnection_currentWorkspaceId_idx" ON "TelegramSystemBotConnection"("currentWorkspaceId");

-- CreateIndex
CREATE INDEX "TelegramSystemBotConnection_enabled_idx" ON "TelegramSystemBotConnection"("enabled");

-- CreateIndex
CREATE INDEX "TelegramSystemBotTaskSubscription_workspaceId_taskKey_idx" ON "TelegramSystemBotTaskSubscription"("workspaceId", "taskKey");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSystemBotTaskSubscription_connectionId_workspaceId_task" ON "TelegramSystemBotTaskSubscription"("connectionId", "workspaceId", "taskKey");

-- CreateIndex
CREATE INDEX "TelegramSystemBotFinanceDraft_connectionId_status_expiresAt_idx" ON "TelegramSystemBotFinanceDraft"("connectionId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "TelegramSystemBotFinanceDraft_workspaceId_status_idx" ON "TelegramSystemBotFinanceDraft"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "TelegramSystemBotFinanceDraft_status_expiresAt_idx" ON "TelegramSystemBotFinanceDraft"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSystemBotUpdateLog_updateId_key" ON "TelegramSystemBotUpdateLog"("updateId");

-- CreateIndex
CREATE INDEX "TelegramSystemBotUpdateLog_status_createdAt_idx" ON "TelegramSystemBotUpdateLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramPost_telegramChannelId_postDate_idx" ON "TelegramPost"("telegramChannelId", "postDate");

-- CreateIndex
CREATE INDEX "TelegramPost_workspaceId_telegramChannelId_postDate_idx" ON "TelegramPost"("workspaceId", "telegramChannelId", "postDate");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPost_telegramChannelId_telegramMessageId_key" ON "TelegramPost"("telegramChannelId", "telegramMessageId");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_createdAt_idx" ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_workspaceId_assignedMemberId_idx" ON "TelegramManagedPost"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_groupId_idx" ON "TelegramManagedPost"("groupId");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_groupId_groupPosition_idx" ON "TelegramManagedPost"("groupId", "groupPosition");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_groupId_status_statusPosition_idx" ON "TelegramManagedPost"("groupId", "status", "statusPosition");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_telegramChannelId_sidebarPosition_idx" ON "TelegramManagedPost"("telegramChannelId", "sidebarPosition");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_plannerRunId_" ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "plannerRunId");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_plannerSlotId" ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "plannerSlotId");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_status_scheduledAt_idx" ON "TelegramManagedPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_origin_status" ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "origin", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "TelegramPostPlannerFormat_workspaceId_telegramChannelId_positio" ON "TelegramPostPlannerFormat"("workspaceId", "telegramChannelId", "position");

-- CreateIndex
CREATE INDEX "TelegramPostPlannerFormat_workspaceId_telegramChannelId_isActiv" ON "TelegramPostPlannerFormat"("workspaceId", "telegramChannelId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPostPlannerFormat_workspaceId_telegramChannelId_name_ke" ON "TelegramPostPlannerFormat"("workspaceId", "telegramChannelId", "name");

-- CreateIndex
CREATE INDEX "TelegramPostPlannerSlot_workspaceId_telegramChannelId_weekday_p" ON "TelegramPostPlannerSlot"("workspaceId", "telegramChannelId", "weekday", "position");

-- CreateIndex
CREATE INDEX "TelegramPostPlannerSlot_workspaceId_telegramChannelId_isActive_" ON "TelegramPostPlannerSlot"("workspaceId", "telegramChannelId", "isActive");

-- CreateIndex
CREATE INDEX "TelegramPostPlannerSlot_workspaceId_telegramChannelId_formatId_" ON "TelegramPostPlannerSlot"("workspaceId", "telegramChannelId", "formatId");

-- CreateIndex
CREATE INDEX "TelegramManagedPostRevision_telegramManagedPostId_createdAt_idx" ON "TelegramManagedPostRevision"("telegramManagedPostId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramManagedPostRevision_workspaceId_createdAt_idx" ON "TelegramManagedPostRevision"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramManagedPostRevision_telegramChannelId_createdAt_idx" ON "TelegramManagedPostRevision"("telegramChannelId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramManagedPostRevision_groupId_status_statusPosition_idx" ON "TelegramManagedPostRevision"("groupId", "status", "statusPosition");

-- CreateIndex
CREATE INDEX "PostGroup_workspaceId_idx" ON "PostGroup"("workspaceId");

-- CreateIndex
CREATE INDEX "PostGroup_telegramChannelId_idx" ON "PostGroup"("telegramChannelId");

-- CreateIndex
CREATE INDEX "PostGroup_createdByMemberId_idx" ON "PostGroup"("createdByMemberId");

-- CreateIndex
CREATE INDEX "PostGroup_telegramChannelId_sidebarPosition_idx" ON "PostGroup"("telegramChannelId", "sidebarPosition");

-- CreateIndex
CREATE UNIQUE INDEX "PostGroup_telegramChannelId_systemKey_key" ON "PostGroup"("telegramChannelId", "systemKey");

-- CreateIndex
CREATE INDEX "TelegramPostMetricSnapshot_telegramPostId_collectedAt_idx" ON "TelegramPostMetricSnapshot"("telegramPostId", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_workspaceId_baseCurrency_targetCurrency_date_key" ON "ExchangeRate"("workspaceId", "baseCurrency", "targetCurrency", "date");

-- CreateIndex
CREATE INDEX "Icon_workspaceId_name_type_idx" ON "Icon"("workspaceId", "name", "type");

-- CreateIndex
CREATE INDEX "Icon_workspaceId_type_idx" ON "Icon"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "Icon_createdByUserId_idx" ON "Icon"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Icon_workspaceId_type_name_key" ON "Icon"("workspaceId", "type", "name");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_avatarIconId_fkey" FOREIGN KEY ("avatarIconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptNote" ADD CONSTRAINT "PromptNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptNote" ADD CONSTRAINT "PromptNote_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptNote" ADD CONSTRAINT "PromptNote_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptNote" ADD CONSTRAINT "PromptNote_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptNote" ADD CONSTRAINT "PromptNote_postGroupId_fkey" FOREIGN KEY ("postGroupId") REFERENCES "PostGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalesTextTemplate" ADD CONSTRAINT "TelegramAdSalesTextTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalesTextTemplate" ADD CONSTRAINT "TelegramAdSalesTextTemplate_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramUserAccountIntegration" ADD CONSTRAINT "TelegramUserAccountIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramUserAccountIntegration" ADD CONSTRAINT "TelegramUserAccountIntegration_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramUserAccountIntegration" ADD CONSTRAINT "TelegramUserAccountIntegration_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAdminLink" ADD CONSTRAINT "TelegramChannelAdminLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAdminLink" ADD CONSTRAINT "TelegramChannelAdminLink_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAdminLink" ADD CONSTRAINT "TelegramChannelAdminLink_telegramUserAccountIntegrationId_fkey" FOREIGN KEY ("telegramUserAccountIntegrationId") REFERENCES "TelegramUserAccountIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelSourceAccess" ADD CONSTRAINT "TelegramChannelSourceAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelSourceAccess" ADD CONSTRAINT "TelegramChannelSourceAccess_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelDataSource" ADD CONSTRAINT "TelegramChannelDataSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelDataSource" ADD CONSTRAINT "TelegramChannelDataSource_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_avatarIconId_fkey" FOREIGN KEY ("avatarIconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCategory" ADD CONSTRAINT "TransactionCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCategory" ADD CONSTRAINT "TransactionCategory_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannel" ADD CONSTRAINT "TelegramChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannel" ADD CONSTRAINT "TelegramChannel_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannel" ADD CONSTRAINT "TelegramChannel_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannel" ADD CONSTRAINT "TelegramChannel_purchaseTransactionId_fkey" FOREIGN KEY ("purchaseTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramCustomEmojiPack" ADD CONSTRAINT "TelegramCustomEmojiPack_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramCustomEmoji" ADD CONSTRAINT "TelegramCustomEmoji_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TelegramCustomEmojiPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelCustomEmojiPack" ADD CONSTRAINT "TelegramChannelCustomEmojiPack_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelCustomEmojiPack" ADD CONSTRAINT "TelegramChannelCustomEmojiPack_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TelegramCustomEmojiPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelTimePost" ADD CONSTRAINT "TelegramChannelTimePost_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelTimePost" ADD CONSTRAINT "TelegramChannelTimePost_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAdAnalysis" ADD CONSTRAINT "TelegramChannelAdAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAdAnalysis" ADD CONSTRAINT "TelegramChannelAdAnalysis_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAdAnalysis" ADD CONSTRAINT "TelegramChannelAdAnalysis_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelDailyStats" ADD CONSTRAINT "TelegramChannelDailyStats_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelStatsSnapshot" ADD CONSTRAINT "TelegramChannelStatsSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelStatsSnapshot" ADD CONSTRAINT "TelegramChannelStatsSnapshot_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelStatsPoint" ADD CONSTRAINT "TelegramChannelStatsPoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelStatsPoint" ADD CONSTRAINT "TelegramChannelStatsPoint_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAudienceSnapshot" ADD CONSTRAINT "TelegramChannelAudienceSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAudienceSnapshot" ADD CONSTRAINT "TelegramChannelAudienceSnapshot_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelNetwork" ADD CONSTRAINT "TelegramChannelNetwork_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelNetwork" ADD CONSTRAINT "TelegramChannelNetwork_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelNetwork" ADD CONSTRAINT "TelegramChannelNetwork_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelNetworkMember" ADD CONSTRAINT "TelegramChannelNetworkMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelNetworkMember" ADD CONSTRAINT "TelegramChannelNetworkMember_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "TelegramChannelNetwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelNetworkMember" ADD CONSTRAINT "TelegramChannelNetworkMember_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdProduct" ADD CONSTRAINT "TelegramAdProduct_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdProduct" ADD CONSTRAINT "TelegramAdProduct_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSchedulePolicy" ADD CONSTRAINT "TelegramAdSchedulePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSchedulePolicy" ADD CONSTRAINT "TelegramAdSchedulePolicy_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalesWorkspaceSettings" ADD CONSTRAINT "TelegramAdSalesWorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalesMemberPreferences" ADD CONSTRAINT "TelegramAdSalesMemberPreferences_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalesMemberPreferences" ADD CONSTRAINT "TelegramAdSalesMemberPreferences_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdPriceSnapshot" ADD CONSTRAINT "TelegramAdPriceSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdPriceSnapshot" ADD CONSTRAINT "TelegramAdPriceSnapshot_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdPriceSnapshot" ADD CONSTRAINT "TelegramAdPriceSnapshot_telegramAdProductId_fkey" FOREIGN KEY ("telegramAdProductId") REFERENCES "TelegramAdProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdInventoryDailySnapshot" ADD CONSTRAINT "TelegramAdInventoryDailySnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdInventoryDailySnapshot" ADD CONSTRAINT "TelegramAdInventoryDailySnapshot_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "TelegramAdvertiserTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_sourceAdvertiserActivityId_fkey" FOREIGN KEY ("sourceAdvertiserActivityId") REFERENCES "TelegramAdvertiserActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePlacement" ADD CONSTRAINT "TelegramAdSalePlacement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePlacement" ADD CONSTRAINT "TelegramAdSalePlacement_telegramAdSaleId_fkey" FOREIGN KEY ("telegramAdSaleId") REFERENCES "TelegramAdSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePlacement" ADD CONSTRAINT "TelegramAdSalePlacement_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePlacement" ADD CONSTRAINT "TelegramAdSalePlacement_telegramChannelNetworkId_fkey" FOREIGN KEY ("telegramChannelNetworkId") REFERENCES "TelegramChannelNetwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePlacement" ADD CONSTRAINT "TelegramAdSalePlacement_telegramAdProductId_fkey" FOREIGN KEY ("telegramAdProductId") REFERENCES "TelegramAdProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePlacement" ADD CONSTRAINT "TelegramAdSalePlacement_pricingSnapshotId_fkey" FOREIGN KEY ("pricingSnapshotId") REFERENCES "TelegramAdPriceSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePlacement" ADD CONSTRAINT "TelegramAdSalePlacement_managedPostId_fkey" FOREIGN KEY ("managedPostId") REFERENCES "TelegramManagedPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePlacement" ADD CONSTRAINT "TelegramAdSalePlacement_telegramPostId_fkey" FOREIGN KEY ("telegramPostId") REFERENCES "TelegramPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiser" ADD CONSTRAINT "TelegramAdvertiser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiser" ADD CONSTRAINT "TelegramAdvertiser_ownerMemberId_fkey" FOREIGN KEY ("ownerMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiser" ADD CONSTRAINT "TelegramAdvertiser_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserContact" ADD CONSTRAINT "TelegramAdvertiserContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserContact" ADD CONSTRAINT "TelegramAdvertiserContact_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTag" ADD CONSTRAINT "TelegramAdvertiserTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTagAssignment" ADD CONSTRAINT "TelegramAdvertiserTagAssignment_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTagAssignment" ADD CONSTRAINT "TelegramAdvertiserTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TelegramAdvertiserTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTagAssignment" ADD CONSTRAINT "TelegramAdvertiserTagAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTagAssignment" ADD CONSTRAINT "TelegramAdvertiserTagAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "TelegramAdSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TelegramAdSalePlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TelegramAdvertiserTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "TelegramAdSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TelegramAdSalePlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "TelegramAdvertiserAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdCrmMemberSettings" ADD CONSTRAINT "TelegramAdCrmMemberSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdCrmMemberSettings" ADD CONSTRAINT "TelegramAdCrmMemberSettings_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdCrmWorkspaceSettings" ADD CONSTRAINT "TelegramAdCrmWorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserAutomationRule" ADD CONSTRAINT "TelegramAdvertiserAutomationRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserAutomationRule" ADD CONSTRAINT "TelegramAdvertiserAutomationRule_specificMemberId_fkey" FOREIGN KEY ("specificMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "TelegramAdvertiserAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "TelegramAdSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TelegramAdSalePlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TelegramAdvertiserTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdPlacementAdvertiserResult" ADD CONSTRAINT "TelegramAdPlacementAdvertiserResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdPlacementAdvertiserResult" ADD CONSTRAINT "TelegramAdPlacementAdvertiserResult_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TelegramAdSalePlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdPlacementAdvertiserResult" ADD CONSTRAINT "TelegramAdPlacementAdvertiserResult_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePayment" ADD CONSTRAINT "TelegramAdSalePayment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePayment" ADD CONSTRAINT "TelegramAdSalePayment_telegramAdSaleId_fkey" FOREIGN KEY ("telegramAdSaleId") REFERENCES "TelegramAdSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePayment" ADD CONSTRAINT "TelegramAdSalePayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePayment" ADD CONSTRAINT "TelegramAdSalePayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePayment" ADD CONSTRAINT "TelegramAdSalePayment_reversalTransactionId_fkey" FOREIGN KEY ("reversalTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePayment" ADD CONSTRAINT "TelegramAdSalePayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePaymentAllocation" ADD CONSTRAINT "TelegramAdSalePaymentAllocation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePaymentAllocation" ADD CONSTRAINT "TelegramAdSalePaymentAllocation_telegramAdSalePaymentId_fkey" FOREIGN KEY ("telegramAdSalePaymentId") REFERENCES "TelegramAdSalePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAdSalePaymentAllocation" ADD CONSTRAINT "TelegramAdSalePaymentAllocation_telegramAdSalePlacementId_fkey" FOREIGN KEY ("telegramAdSalePlacementId") REFERENCES "TelegramAdSalePlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promo" ADD CONSTRAINT "Promo_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promo" ADD CONSTRAINT "Promo_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promo" ADD CONSTRAINT "Promo_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promo" ADD CONSTRAINT "Promo_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promo" ADD CONSTRAINT "Promo_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignPromo" ADD CONSTRAINT "AdCampaignPromo_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignPromo" ADD CONSTRAINT "AdCampaignPromo_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "Promo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisingSource" ADD CONSTRAINT "AdvertisingSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisingSource" ADD CONSTRAINT "AdvertisingSource_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisingSource" ADD CONSTRAINT "AdvertisingSource_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_advertisingSourceId_fkey" FOREIGN KEY ("advertisingSourceId") REFERENCES "AdvertisingSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "Promo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignAdmissionBatch" ADD CONSTRAINT "AdCampaignAdmissionBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignAdmissionBatch" ADD CONSTRAINT "AdCampaignAdmissionBatch_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignAdmissionBatch" ADD CONSTRAINT "AdCampaignAdmissionBatch_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignAdmissionViewSnapshot" ADD CONSTRAINT "AdCampaignAdmissionViewSnapshot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AdCampaignAdmissionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignAdmissionBackfillState" ADD CONSTRAINT "AdCampaignAdmissionBackfillState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignAdmissionBackfillState" ADD CONSTRAINT "AdCampaignAdmissionBackfillState_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHypothesis" ADD CONSTRAINT "AdHypothesis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHypothesis" ADD CONSTRAINT "AdHypothesis_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHypothesis" ADD CONSTRAINT "AdHypothesis_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHypothesis" ADD CONSTRAINT "AdHypothesis_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHypothesis" ADD CONSTRAINT "AdHypothesis_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHypothesisCampaign" ADD CONSTRAINT "AdHypothesisCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHypothesisCampaign" ADD CONSTRAINT "AdHypothesisCampaign_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "AdHypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHypothesisCampaign" ADD CONSTRAINT "AdHypothesisCampaign_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAnalyticsSyncRun" ADD CONSTRAINT "DailyAnalyticsSyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTaskConfig" ADD CONSTRAINT "ScheduledTaskConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTaskRun" ADD CONSTRAINT "ScheduledTaskRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTaskRun" ADD CONSTRAINT "ScheduledTaskRun_scheduledTaskConfigId_fkey" FOREIGN KEY ("scheduledTaskConfigId") REFERENCES "ScheduledTaskConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTaskLease" ADD CONSTRAINT "ScheduledTaskLease_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationLog" ADD CONSTRAINT "ApplicationLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationLog" ADD CONSTRAINT "ApplicationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignAdvertisingChannel" ADD CONSTRAINT "AdCampaignAdvertisingChannel_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignAdvertisingChannel" ADD CONSTRAINT "AdCampaignAdvertisingChannel_advertisingSourceId_fkey" FOREIGN KEY ("advertisingSourceId") REFERENCES "AdvertisingSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignTelegramChannelPlacement" ADD CONSTRAINT "AdCampaignTelegramChannelPlacement_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignTelegramChannelPlacement" ADD CONSTRAINT "AdCampaignTelegramChannelPlacement_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLink" ADD CONSTRAINT "TelegramInviteLink_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLink" ADD CONSTRAINT "TelegramInviteLink_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLink" ADD CONSTRAINT "TelegramInviteLink_creatorMemberId_workspaceId_fkey" FOREIGN KEY ("creatorMemberId", "workspaceId") REFERENCES "WorkspaceMember"("id", "workspaceId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLinkSnapshot" ADD CONSTRAINT "TelegramInviteLinkSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLinkSnapshot" ADD CONSTRAINT "TelegramInviteLinkSnapshot_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLinkSnapshot" ADD CONSTRAINT "TelegramInviteLinkSnapshot_inviteLinkId_fkey" FOREIGN KEY ("inviteLinkId") REFERENCES "TelegramInviteLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLinkSnapshot" ADD CONSTRAINT "TelegramInviteLinkSnapshot_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotIntegration" ADD CONSTRAINT "TelegramBotIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotIntegration" ADD CONSTRAINT "TelegramBotIntegration_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotIntegration" ADD CONSTRAINT "TelegramBotIntegration_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotApplicationWorkspaceAccess" ADD CONSTRAINT "TelegramBotApplicationWorkspaceAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotUser" ADD CONSTRAINT "TelegramBotUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotUser" ADD CONSTRAINT "TelegramBotUser_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotUpdateLog" ADD CONSTRAINT "TelegramBotUpdateLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotUpdateLog" ADD CONSTRAINT "TelegramBotUpdateLog_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotDelivery" ADD CONSTRAINT "TelegramBotDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotDelivery" ADD CONSTRAINT "TelegramBotDelivery_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotDelivery" ADD CONSTRAINT "TelegramBotDelivery_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotDelivery" ADD CONSTRAINT "TelegramBotDelivery_financeReminderId_fkey" FOREIGN KEY ("financeReminderId") REFERENCES "FinanceReminder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterConfig" ADD CONSTRAINT "GreeterConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterConfig" ADD CONSTRAINT "GreeterConfig_botIntegrationId_workspaceId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterConfig" ADD CONSTRAINT "GreeterConfig_currentPublishedVersionId_fkey" FOREIGN KEY ("currentPublishedVersionId") REFERENCES "GreeterConfigVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterConfigVersion" ADD CONSTRAINT "GreeterConfigVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterConfigVersion" ADD CONSTRAINT "GreeterConfigVersion_bot_workspace_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterConfigVersion" ADD CONSTRAINT "GreeterConfigVersion_configId_fkey" FOREIGN KEY ("configId") REFERENCES "GreeterConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterChannel" ADD CONSTRAINT "GreeterChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterChannel" ADD CONSTRAINT "GreeterChannel_botIntegrationId_workspaceId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterChannel" ADD CONSTRAINT "GreeterChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterChannel" ADD CONSTRAINT "GreeterChannel_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId") REFERENCES "GreeterConfig"("botIntegrationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterChannelConfigVersion" ADD CONSTRAINT "GreeterChannelConfigVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterChannelConfigVersion" ADD CONSTRAINT "GreeterChannelConfigVersion_bot_workspace_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterChannelConfigVersion" ADD CONSTRAINT "GreeterChannelConfigVersion_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "GreeterConfigVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterChannelConfigVersion" ADD CONSTRAINT "GreeterChannelConfigVersion_greeterChannelId_fkey" FOREIGN KEY ("greeterChannelId") REFERENCES "GreeterChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterJoinRequest" ADD CONSTRAINT "GreeterJoinRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterJoinRequest" ADD CONSTRAINT "GreeterJoinRequest_botIntegrationId_workspaceId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterJoinRequest" ADD CONSTRAINT "GreeterJoinRequest_greeterChannelId_fkey" FOREIGN KEY ("greeterChannelId") REFERENCES "GreeterChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterJoinRequest" ADD CONSTRAINT "GreeterJoinRequest_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterJoinRequest" ADD CONSTRAINT "GreeterJoinRequest_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterJoinRequest" ADD CONSTRAINT "GreeterJoinRequest_captchaDeliveryId_fkey" FOREIGN KEY ("captchaDeliveryId") REFERENCES "TelegramBotDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterJoinRequest" ADD CONSTRAINT "GreeterJoinRequest_outcomeDeliveryId_fkey" FOREIGN KEY ("outcomeDeliveryId") REFERENCES "TelegramBotDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterJoinRequest" ADD CONSTRAINT "GreeterJoinRequest_testSessionId_fkey" FOREIGN KEY ("testSessionId") REFERENCES "GreeterTestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequence" ADD CONSTRAINT "GreeterSequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequence" ADD CONSTRAINT "GreeterSequence_botIntegrationId_workspaceId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequence" ADD CONSTRAINT "GreeterSequence_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceVersion" ADD CONSTRAINT "GreeterSequenceVersion_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "GreeterSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceStep" ADD CONSTRAINT "GreeterSequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "GreeterSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceStep" ADD CONSTRAINT "GreeterSequenceStep_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "GreeterSequenceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceEnrollment" ADD CONSTRAINT "GreeterSequenceEnrollment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceEnrollment" ADD CONSTRAINT "GreeterSequenceEnrollment_botIntegrationId_workspaceId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceEnrollment" ADD CONSTRAINT "GreeterSequenceEnrollment_sequenceVersionId_fkey" FOREIGN KEY ("sequenceVersionId") REFERENCES "GreeterSequenceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceEnrollment" ADD CONSTRAINT "GreeterSequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "GreeterSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceEnrollment" ADD CONSTRAINT "GreeterSequenceEnrollment_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceEnrollment" ADD CONSTRAINT "GreeterSequenceEnrollment_acquiredChannelId_fkey" FOREIGN KEY ("acquiredChannelId") REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceEnrollment" ADD CONSTRAINT "GreeterSequenceEnrollment_acquisitionJoinRequestId_fkey" FOREIGN KEY ("acquisitionJoinRequestId") REFERENCES "GreeterJoinRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceStepExecution" ADD CONSTRAINT "GreeterSequenceStepExecution_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "GreeterSequenceEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceStepExecution" ADD CONSTRAINT "GreeterSequenceStepExecution_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "GreeterSequenceStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterSequenceStepExecution" ADD CONSTRAINT "GreeterSequenceStepExecution_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "TelegramBotDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterBroadcast" ADD CONSTRAINT "GreeterBroadcast_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterBroadcast" ADD CONSTRAINT "GreeterBroadcast_botIntegrationId_workspaceId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterBroadcast" ADD CONSTRAINT "GreeterBroadcast_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterBroadcastRecipient" ADD CONSTRAINT "GreeterBroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "GreeterBroadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterBroadcastRecipient" ADD CONSTRAINT "GreeterBroadcastRecipient_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterBroadcastRecipient" ADD CONSTRAINT "GreeterBroadcastRecipient_acquiredChannelId_fkey" FOREIGN KEY ("acquiredChannelId") REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterBroadcastRecipient" ADD CONSTRAINT "GreeterBroadcastRecipient_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "TelegramBotDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterTestSession" ADD CONSTRAINT "GreeterTestSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterTestSession" ADD CONSTRAINT "GreeterTestSession_botIntegrationId_workspaceId_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterTestSession" ADD CONSTRAINT "GreeterTestSession_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterTestSession" ADD CONSTRAINT "GreeterTestSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterUserEnvironmentState" ADD CONSTRAINT "GreeterUserEnvironmentState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterUserEnvironmentState" ADD CONSTRAINT "GreeterUserEnvironmentState_bot_workspace_fkey" FOREIGN KEY ("botIntegrationId", "workspaceId") REFERENCES "TelegramBotIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreeterUserEnvironmentState" ADD CONSTRAINT "GreeterUserEnvironmentState_userId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceProfile" ADD CONSTRAINT "FinanceProfile_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceProfile" ADD CONSTRAINT "FinanceProfile_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAiProviderConfig" ADD CONSTRAINT "FinanceAiProviderConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAiProviderConfig" ADD CONSTRAINT "FinanceAiProviderConfig_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMerchantMapping" ADD CONSTRAINT "FinanceMerchantMapping_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSpendingLimit" ADD CONSTRAINT "FinanceSpendingLimit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSpendingLimit" ADD CONSTRAINT "FinanceSpendingLimit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReminder" ADD CONSTRAINT "FinanceReminder_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceGoal" ADD CONSTRAINT "FinanceGoal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePendingProposal" ADD CONSTRAINT "FinancePendingProposal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePendingProposal" ADD CONSTRAINT "FinancePendingProposal_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssistantProfile" ADD CONSTRAINT "FinanceAssistantProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAiUsage" ADD CONSTRAINT "FinanceAiUsage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotBillingProviderConfig" ADD CONSTRAINT "BotBillingProviderConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotBillingProviderConfig" ADD CONSTRAINT "BotBillingProviderConfig_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSubscriptionPlan" ADD CONSTRAINT "BotSubscriptionPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSubscriptionPlan" ADD CONSTRAINT "BotSubscriptionPlan_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotPlanPrice" ADD CONSTRAINT "BotPlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BotSubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSubscription" ADD CONSTRAINT "BotSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSubscription" ADD CONSTRAINT "BotSubscription_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSubscription" ADD CONSTRAINT "BotSubscription_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSubscription" ADD CONSTRAINT "BotSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BotSubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSubscription" ADD CONSTRAINT "BotSubscription_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "BotPlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSubscriptionGrant" ADD CONSTRAINT "BotSubscriptionGrant_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BotSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotCoupon" ADD CONSTRAINT "BotCoupon_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotCoupon" ADD CONSTRAINT "BotCoupon_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotCoupon" ADD CONSTRAINT "BotCoupon_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BotSubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotCouponRedemption" ADD CONSTRAINT "BotCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "BotCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotCouponRedemption" ADD CONSTRAINT "BotCouponRedemption_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotCouponRedemption" ADD CONSTRAINT "BotCouponRedemption_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "BotPlanPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotProviderCustomer" ADD CONSTRAINT "BotProviderCustomer_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotProviderSubscription" ADD CONSTRAINT "BotProviderSubscription_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BotSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotBillingEvent" ADD CONSTRAINT "BotBillingEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotBillingEvent" ADD CONSTRAINT "BotBillingEvent_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotBillingEvent" ADD CONSTRAINT "BotBillingEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BotSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramSystemBotConnection" ADD CONSTRAINT "TelegramSystemBotConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramSystemBotConnection" ADD CONSTRAINT "TelegramSystemBotConnection_currentWorkspaceId_fkey" FOREIGN KEY ("currentWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramSystemBotTaskSubscription" ADD CONSTRAINT "TelegramSystemBotTaskSubscription_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "TelegramSystemBotConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramSystemBotTaskSubscription" ADD CONSTRAINT "TelegramSystemBotTaskSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramSystemBotFinanceDraft" ADD CONSTRAINT "TelegramSystemBotFinanceDraft_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "TelegramSystemBotConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramSystemBotFinanceDraft" ADD CONSTRAINT "TelegramSystemBotFinanceDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPost" ADD CONSTRAINT "TelegramPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPost" ADD CONSTRAINT "TelegramPost_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId", "workspaceId") REFERENCES "WorkspaceMember"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PostGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_plannerFormatId_fkey" FOREIGN KEY ("plannerFormatId") REFERENCES "TelegramPostPlannerFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_plannerSlotId_fkey" FOREIGN KEY ("plannerSlotId") REFERENCES "TelegramPostPlannerSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPostPlannerFormat" ADD CONSTRAINT "TelegramPostPlannerFormat_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPostPlannerFormat" ADD CONSTRAINT "TelegramPostPlannerFormat_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPostPlannerSlot" ADD CONSTRAINT "TelegramPostPlannerSlot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPostPlannerSlot" ADD CONSTRAINT "TelegramPostPlannerSlot_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPostPlannerSlot" ADD CONSTRAINT "TelegramPostPlannerSlot_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "TelegramPostPlannerFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_telegramManagedPostId_fkey" FOREIGN KEY ("telegramManagedPostId") REFERENCES "TelegramManagedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_assignedMemberId_workspaceId_fkey" FOREIGN KEY ("assignedMemberId", "workspaceId") REFERENCES "WorkspaceMember"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PostGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostGroup" ADD CONSTRAINT "PostGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostGroup" ADD CONSTRAINT "PostGroup_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostGroup" ADD CONSTRAINT "PostGroup_createdByMemberId_workspaceId_fkey" FOREIGN KEY ("createdByMemberId", "workspaceId") REFERENCES "WorkspaceMember"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPostMetricSnapshot" ADD CONSTRAINT "TelegramPostMetricSnapshot_telegramPostId_fkey" FOREIGN KEY ("telegramPostId") REFERENCES "TelegramPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Icon" ADD CONSTRAINT "Icon_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Icon" ADD CONSTRAINT "Icon_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma Schema Language cannot represent partial indexes. PostgreSQL unique
-- indexes already allow multiple NULL tuples; the predicate records the exact
-- production object and avoids indexing locally-authored rows.
CREATE UNIQUE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_remoteImport_"
ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "remoteImportKey")
WHERE "remoteImportKey" IS NOT NULL;
