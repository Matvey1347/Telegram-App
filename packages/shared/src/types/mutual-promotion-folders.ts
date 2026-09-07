import type { TelegramPostButtonRows } from "./telegram-post-buttons";
import type { ResolvedEmoji } from "./resolved-emoji";

export type MutualPromotionFolderStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "DELETING"
  | "COMPLETED"
  | "CANCELLED";

export type MutualPromotionParticipantRole = "PUBLISHER" | "PAID";

export type MutualPromotionInviteLinkMode = "FOLDER_ONLY" | "REUSABLE";

export type MutualPromotionDeliveryStatus =
  | "PENDING"
  | "PUBLISHING"
  | "PUBLISHED"
  | "DELETING"
  | "DELETED"
  | "FAILED"
  | "SKIPPED";

export type MutualPromotionFolderParticipantInput = {
  telegramChannelId: string;
  role: MutualPromotionParticipantRole;
  inviteLinkId: string;
  inviteLinkMode: MutualPromotionInviteLinkMode;
  expense?: {
    accountId: string;
    amount: number;
  } | null;
};

export type CreateMutualPromotionFolderPayload = {
  title: string;
  titleTemplate?: string | null;
  startsAt: string;
  endsAt: string;
  notes?: string | null;
  assignedMemberId?: string | null;
  participants: MutualPromotionFolderParticipantInput[];
};

export type UpdateMutualPromotionFolderPayload =
  CreateMutualPromotionFolderPayload;

export type CreateMutualPromotionPostPayload = {
  importWorkflowId: string;
  posts: Array<{
    scheduledAt: string;
    title: string;
    text: string;
    imageUrls: string[];
    buttonRows: TelegramPostButtonRows;
  }>;
};

export type UpdateMutualPromotionPostPayload = {
  scheduledAt: string;
  title: string;
  text: string;
  imageUrls: string[];
  buttonRows: TelegramPostButtonRows;
};

export type MutualPromotionExpensePayload = {
  accountId: string;
  amount: number;
};

export type MutualPromotionInviteLinkOption = {
  id: string;
  telegramChannelId: string;
  name: string;
  url: string;
  joinedCount: number;
  requestedCount: number;
  isRevoked: boolean;
  available: boolean;
  unavailableReason: "ADS" | "FOLDER_ONLY" | "OVERLAP" | null;
  creatorUsername: string | null;
  creatorFirstName: string | null;
  creatorPhotoUrl: string | null;
  creatorMember: {
    id: string;
    name: string;
    avatarPresentation: ResolvedEmoji | null;
  } | null;
};

export type MutualPromotionFolderListItem = {
  id: string;
  title: string;
  titleTemplate: string | null;
  status: MutualPromotionFolderStatus;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  participantCount: number;
  publisherCount: number;
  paidCount: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MutualPromotionFolderExpense = {
  transactionId: string;
  accountId: string;
  accountName: string;
  amount: number;
  currency: string;
  amountInPrimaryCurrency: number;
};

export type MutualPromotionFolderParticipantStats = {
  joinedCount: number | null;
  unsubscribedCount: number | null;
  unsubscribedIsEstimate: boolean;
  audienceDelta: number | null;
  subscriberPrice: number | null;
  currency: string | null;
  dataQuality: "PENDING" | "CACHED_BOUNDARIES" | "INCOMPLETE";
};

export type MutualPromotionFolderParticipant = {
  id: string;
  telegramChannelId: string;
  role: MutualPromotionParticipantRole;
  inviteLinkMode: MutualPromotionInviteLinkMode;
  channel: {
    id: string;
    title: string;
    username: string | null;
    photoUrl: string | null;
  };
  inviteLink: {
    id: string;
    name: string;
    url: string;
  };
  subscribersAtStart: number | null;
  subscribersAtEnd: number | null;
  inviteJoinedAtStart: number | null;
  inviteJoinedAtEnd: number | null;
  baselineCapturedAt: string | null;
  finalCapturedAt: string | null;
  expense: MutualPromotionFolderExpense | null;
  stats: MutualPromotionFolderParticipantStats;
};

export type MutualPromotionPostDelivery = {
  id: string;
  participantId: string;
  telegramChannelId: string;
  managedPostId: string | null;
  status: MutualPromotionDeliveryStatus;
  publishedAt: string | null;
  deletedAt: string | null;
  lastError: string | null;
};

export type MutualPromotionFolderPost = {
  id: string;
  title: string;
  text: string | null;
  imageUrls: string[];
  buttonRows: TelegramPostButtonRows;
  scheduledAt: string;
  position: number;
  deliveries: MutualPromotionPostDelivery[];
  createdAt: string;
  updatedAt: string;
};

export type MutualPromotionFolderDetail = MutualPromotionFolderListItem & {
  assignedMemberId: string | null;
  participants: MutualPromotionFolderParticipant[];
  posts: MutualPromotionFolderPost[];
};

export type MutualPromotionActivationResult = {
  folder: MutualPromotionFolderDetail;
  deliveriesCreated: number;
  successCount: number;
  failedCount: number;
  telegramNativeCount: number;
  localSchedulerCount: number;
};

export type MutualPromotionActivationProgress = {
  deliveryId: string | null;
  folderPostId: string | null;
  postTitle: string | null;
  telegramChannelId: string | null;
  channelTitle: string | null;
  mode: "TELEGRAM_NATIVE" | "LOCAL_SCHEDULER" | null;
  status: "PREPARING" | "SCHEDULING" | "SCHEDULED" | "FAILED";
  success: boolean | null;
  message: string;
  error?: string;
};

export type MutualPromotionActivationProgressHandler = (
  item: MutualPromotionActivationProgress,
  current: number,
  total: number,
) => void;
