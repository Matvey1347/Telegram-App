import { type TelegramPublishPostParams } from './telegram-mtproto-publish-post';
import { type TelegramHistoryCutoff } from './telegram-history-cutoff';
import { waitTelegramOperationWithTimeout } from './telegram-publication-deadline';
import { Injectable, Logger } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import type { TelegramInviteLinksResult } from './telegram-invite-links.types';
import { normalizeTelegramChannelId } from '@api/telegram/shared/imports/telegram-post-url';
import type { TelegramQrLoginProgress } from '@telegram-system/shared';
import type { TelegramAccountProfile } from '@api/telegram/shared/mtproto/telegram-mtproto-account-profile';
import {
  closeTelegramMtprotoSession,
  createTelegramMtprotoSession,
  type TelegramMtprotoSessionCredentials,
} from '@api/telegram/shared/mtproto/telegram-mtproto-session.factory';
import {
  type SessionParams,
  type ImportableTelegramEntity,
  type StoredTelegramChannelReference,
  type ResolvedStoredTelegramChannel,
  type TelegramScheduledMessage,
  type TelegramManagedPostHistory,
  type ResolvedTelegramCustomEmojiPack,
  type ExportedInvitePayload,
  type InviteLinksProgressCallback,
  type InviteLinkLoadedCallback,
  type TelegramLongLike,
} from './telegram-mtproto-client-types';
import { TelegramMtprotoAccounts } from './telegram-mtproto-account';
import { TelegramMtprotoChannelResolution } from './telegram-mtproto-channel-resolution';
import { TelegramMtprotoChannelMetadata } from './telegram-mtproto-channel-metadata';
import { TelegramMtprotoEmojiPacks } from './telegram-mtproto-emoji-packs';
import { TelegramMtprotoChannelHistory } from './telegram-mtproto-channel-history';
import { TelegramMtprotoBroadcastStatistics } from './telegram-mtproto-broadcast-statistics';
import { TelegramMtprotoInviteAdminReader } from './telegram-mtproto-invite-admin-reader';
import { TelegramMtprotoInviteLinks } from './telegram-mtproto-invite-links';
import { TelegramMtprotoPublicationTransport } from './telegram-mtproto-publication-transport';
export type { TelegramInviteLinksResult } from './telegram-invite-links.types';
export type { TelegramAccountProfile } from './telegram-mtproto-account-profile';
export type {
  ResolvedTelegramCustomEmojiPack,
  StoredTelegramChannelReference,
  TelegramScheduledMessage,
} from './telegram-mtproto-client-types';

@Injectable()
export class TelegramMtprotoClient {
  private readonly logger = new Logger(TelegramMtprotoClient.name);

  private readonly maxInviteLinkPages = 200;

  private readonly telegramResolveTimeoutMs = 20_000;

  private readonly telegramMetadataTimeoutMs = 10_000;

  public toFiniteNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'object') {
      const candidate = (value as any).value ?? (value as any).low ?? null;
      if (candidate != null) return this.toFiniteNumber(candidate);
    }
    return null;
  }

  public toTelegramDate(value: unknown): Date | null {
    if (value instanceof Date) return value;
    const numeric = this.toFiniteNumber(value);
    if (numeric == null) return null;
    // Telegram date fields are often unix seconds; detect and normalize.
    const millis = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private normalizeChatId(value?: string | null) {
    return normalizeTelegramChannelId(value);
  }

  public unwrapExportedChatInvite(
    invite: unknown,
  ): ExportedInvitePayload | null {
    return this.inviteLinks.unwrapExportedChatInvite(invite);
  }

  public toBigInt(value: unknown) {
    const normalized = this.normalizeChatId(
      typeof value === 'string'
        ? value
        : this.toFiniteNumber(value)?.toString(),
    );
    if (!normalized) return null;
    try {
      return BigInt(normalized);
    } catch {
      return null;
    }
  }

  private isTelegramLongLike(value: unknown): value is TelegramLongLike {
    if (value == null) return false;
    if (typeof value === 'bigint') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.trim().length > 0;
    return (
      typeof value === 'object' &&
      typeof (value as { toString?: unknown }).toString === 'function'
    );
  }

  private telegramLongToString(value: unknown) {
    if (!this.isTelegramLongLike(value)) return null;
    const rendered = value.toString().trim();
    return rendered ? rendered : null;
  }

  private entityAccessHashValue(entity: ImportableTelegramEntity) {
    const raw = (entity as { accessHash?: unknown }).accessHash;
    return this.isTelegramLongLike(raw) ? raw : null;
  }

  private entityAccessHash(entity: ImportableTelegramEntity) {
    return this.telegramLongToString(this.entityAccessHashValue(entity));
  }

  private rememberKnownUser(
    knownUsers: Map<string, Api.User>,
    user: Api.User,
    source: string,
  ) {
    return this.inviteAdminReader.rememberKnownUser(knownUsers, user, source);
  }

  private async getAccountProfileFromClient(
    client: TelegramClient,
    fallbackUser?: Api.User | null,
  ): Promise<TelegramAccountProfile> {
    return this.accounts.getAccountProfileFromClient(client, fallbackUser);
  }

  public async createClient(
    { apiId, apiHash, session }: SessionParams,
    signal?: AbortSignal,
  ) {
    const startedAt = this.now();
    this.logger.log(
      `Connecting MTProto client: apiId=${apiId} session=${session ? 'present' : 'empty'}`,
    );
    const client = await createTelegramMtprotoSession(
      { apiId, apiHash, session },
      signal,
    );
    this.logger.log(
      `MTProto client connected in ${this.elapsed(startedAt)}: apiId=${apiId}`,
    );
    return client;
  }

  public async closeClient(client: TelegramClient) {
    await closeTelegramMtprotoSession(client);
  }

  public readonly withTimeout = waitTelegramOperationWithTimeout;

  private readonly accounts = new TelegramMtprotoAccounts({
    closeClient: (...args) => this.closeClient(...args),
    createClient: (...args) => this.createClient(...args),
    profilePhotoDataUrl: (...args) => this.profilePhotoDataUrl(...args),
    telegramMetadataTimeoutMs: this.telegramMetadataTimeoutMs,
    toFiniteNumber: (...args) => this.toFiniteNumber(...args),
    toJsonSafe: (...args) => this.toJsonSafe(...args),
    getAccountProfileFromClient: (...args) =>
      this.getAccountProfileFromClient(...args),
  });

  private readonly channelResolution = new TelegramMtprotoChannelResolution({
    resolveStoredChannel: (client, reference) =>
      this.resolveStoredChannel(client, reference),
    closeClient: (...args) => this.closeClient(...args),
    createClient: (...args) => this.createClient(...args),
    describeEntity: (...args) => this.channelMetadata.describeEntity(...args),
    elapsed: (...args) => this.elapsed(...args),
    entityIdToString: (...args) =>
      this.channelMetadata.entityIdToString(...args),
    entityKind: (...args) => this.channelMetadata.entityKind(...args),
    entityTitle: (...args) => this.channelMetadata.entityTitle(...args),
    errorSummary: (...args) => this.errorSummary(...args),
    inferAccessMode: (...args) => this.channelMetadata.inferAccessMode(...args),
    logger: this.logger,
    normalizeChatId: (...args) => this.normalizeChatId(...args),
    now: (...args) => this.now(...args),
    telegramResolveTimeoutMs: this.telegramResolveTimeoutMs,
    toBigInt: (...args) => this.toBigInt(...args),
    toFiniteNumber: (...args) => this.toFiniteNumber(...args),
    toJsonSafe: (...args) => this.toJsonSafe(...args),
    withTimeout: (...args) => this.withTimeout(...args),
  });

  private readonly channelMetadata = new TelegramMtprotoChannelMetadata({
    elapsed: (...args) => this.elapsed(...args),
    entityAccessHash: (...args) => this.entityAccessHash(...args),
    logger: this.logger,
    now: (...args) => this.now(...args),
    profilePhotoDataUrl: (...args) => this.profilePhotoDataUrl(...args),
    telegramMetadataTimeoutMs: this.telegramMetadataTimeoutMs,
    toFiniteNumber: (...args) => this.toFiniteNumber(...args),
    toJsonSafe: (...args) => this.toJsonSafe(...args),
    withTimeout: (...args) => this.withTimeout(...args),
  });

  private readonly emojiPacks = new TelegramMtprotoEmojiPacks({
    closeClient: (...args) => this.closeClient(...args),
    createClient: (...args) => this.createClient(...args),
  });

  private readonly channelHistory = new TelegramMtprotoChannelHistory({
    asImportableTelegramEntity: (...args) =>
      this.channelResolution.asImportableTelegramEntity(...args),
    closeClient: (...args) => this.closeClient(...args),
    createClient: (...args) => this.createClient(...args),
    getAllChannelInviteLinksInternal: (...args) =>
      this.getAllChannelInviteLinksInternal(...args),
    getTelegramErrorCode: (...args) => this.getTelegramErrorCode(...args),
    logger: this.logger,
    resolveStoredChannel: (...args) => this.resolveStoredChannel(...args),
    telegramMetadataTimeoutMs: this.telegramMetadataTimeoutMs,
    telegramResolveTimeoutMs: this.telegramResolveTimeoutMs,
    toFiniteNumber: (...args) => this.toFiniteNumber(...args),
    toTelegramDate: (...args) => this.toTelegramDate(...args),
    withTimeout: (...args) => this.withTimeout(...args),
  });

  private readonly broadcastStatistics = new TelegramMtprotoBroadcastStatistics(
    {
      closeClient: (...args) => this.closeClient(...args),
      createClient: (...args) => this.createClient(...args),
      getErrorProperty: (...args) => this.getErrorProperty(...args),
      getTelegramErrorCode: (...args) => this.getTelegramErrorCode(...args),
      resolveStoredChannel: (...args) => this.resolveStoredChannel(...args),
      telegramMetadataTimeoutMs: this.telegramMetadataTimeoutMs,
      telegramResolveTimeoutMs: this.telegramResolveTimeoutMs,
      toFiniteNumber: (...args) => this.toFiniteNumber(...args),
      toJsonSafe: (...args) => this.toJsonSafe(...args),
      toTelegramDate: (...args) => this.toTelegramDate(...args),
      withTimeout: (...args) => this.withTimeout(...args),
    },
  );

  private readonly inviteAdminReader = new TelegramMtprotoInviteAdminReader({
    entityAccessHashValue: (...args) => this.entityAccessHashValue(...args),
    getTelegramErrorCode: (...args) => this.getTelegramErrorCode(...args),
    logger: this.logger,
    maxInviteLinkPages: this.maxInviteLinkPages,
    profilePhotoDataUrl: (...args) => this.profilePhotoDataUrl(...args),
    telegramResolveTimeoutMs: this.telegramResolveTimeoutMs,
    toBigInt: (...args) => this.toBigInt(...args),
    toFiniteNumber: (...args) => this.toFiniteNumber(...args),
    toTelegramDate: (...args) => this.toTelegramDate(...args),
    unwrapExportedChatInvite: (...args) =>
      this.unwrapExportedChatInvite(...args),
    withTimeout: (...args) => this.withTimeout(...args),
  });

  private readonly inviteLinks = new TelegramMtprotoInviteLinks({
    asImportableTelegramEntity: (...args) =>
      this.channelResolution.asImportableTelegramEntity(...args),
    closeClient: (...args) => this.closeClient(...args),
    collectInviteLinksForAdmin: (...args) =>
      this.collectInviteLinksForAdmin(...args),
    createClient: (...args) => this.createClient(...args),
    entityAccessHashValue: (...args) => this.entityAccessHashValue(...args),
    entityIdToString: (...args) =>
      this.channelMetadata.entityIdToString(...args),
    getInviteAdminPhotoUrl: (...args) => this.getInviteAdminPhotoUrl(...args),
    getInviteCreatorWithDetails: (...args) =>
      this.getInviteCreatorWithDetails(...args),
    getSelfUserWithDetails: (...args) =>
      this.accounts.getSelfUserWithDetails(...args),
    getTelegramErrorCode: (...args) => this.getTelegramErrorCode(...args),
    inviteAdminCounts: (...args) =>
      this.inviteAdminReader.inviteAdminCounts(...args),
    inviteAdminUserId: (...args) =>
      this.inviteAdminReader.inviteAdminUserId(...args),
    loadChannelInviteAdminsDirectory: (...args) =>
      this.loadChannelInviteAdminsDirectory(...args),
    logInviteSyncEvent: (...args) =>
      this.inviteAdminReader.logInviteSyncEvent(...args),
    mapInviteError: (...args) => this.mapInviteError(...args),
    maxInviteLinkPages: this.maxInviteLinkPages,
    rememberKnownUser: (...args) => this.rememberKnownUser(...args),
    resolveInviteAdminInputUser: (...args) =>
      this.resolveInviteAdminInputUser(...args),
    resolveStoredChannel: (...args) => this.resolveStoredChannel(...args),
    telegramMetadataTimeoutMs: this.telegramMetadataTimeoutMs,
    telegramResolveTimeoutMs: this.telegramResolveTimeoutMs,
    toBigInt: (...args) => this.toBigInt(...args),
    toFiniteNumber: (...args) => this.toFiniteNumber(...args),
    toTelegramDate: (...args) => this.toTelegramDate(...args),
    withTimeout: (...args) => this.withTimeout(...args),
  });

  private readonly publicationTransport =
    new TelegramMtprotoPublicationTransport({
      closeClient: (...args) => this.closeClient(...args),
      createClient: (...args) => this.createClient(...args),
      getChannelMessagesFromCutoff: (...args) =>
        this.getChannelMessagesFromCutoff(...args),
      resolveStoredChannel: (...args) => this.resolveStoredChannel(...args),
      telegramMetadataTimeoutMs: this.telegramMetadataTimeoutMs,
      telegramResolveTimeoutMs: this.telegramResolveTimeoutMs,
      toTelegramDate: (...args) => this.toTelegramDate(...args),
      withTimeout: (...args) => this.withTimeout(...args),
      downloadPublishImage: (...args) => this.downloadPublishImage(...args),
      convertImageBufferWithSips: (...args) =>
        this.convertImageBufferWithSips(...args),
    });

  private now() {
    return Date.now();
  }

  private elapsed(startedAt: number) {
    return `${this.now() - startedAt}ms`;
  }

  private errorSummary(error: unknown) {
    if (!error || typeof error !== 'object') {
      return { message: String(error || 'unknown error') };
    }
    return {
      name: (error as any).name || null,
      message: (error as any).message || null,
      errorMessage: (error as any).errorMessage || null,
      errorCode: (error as any).errorCode || null,
      code: (error as any).code || null,
      seconds: this.toFiniteNumber((error as any).seconds),
      newDc: this.toFiniteNumber((error as any).newDc),
      stack:
        typeof (error as any).stack === 'string' ? (error as any).stack : null,
    };
  }

  private toJsonSafe(value: unknown): unknown {
    if (
      value == null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return value.toString('base64');
    if (Array.isArray(value)) return value.map((item) => this.toJsonSafe(item));
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'function') result[key] = this.toJsonSafe(item);
      }
      return result;
    }
    return null;
  }

  private getErrorProperty(error: unknown, property: string) {
    if (!error || typeof error !== 'object') return null;
    return (error as Record<string, unknown>)[property];
  }

  private getTelegramErrorCode(error: unknown) {
    return String(
      this.getErrorProperty(error, 'errorMessage') ||
        this.getErrorProperty(error, 'message') ||
        'UNKNOWN_ERROR',
    );
  }

  private async profilePhotoDataUrl(
    client: TelegramClient,
    entity: unknown,
    isBig = true,
  ) {
    try {
      const photo = await this.withTimeout(
        client.downloadProfilePhoto(entity as any, {
          isBig,
        }),
        this.telegramMetadataTimeoutMs,
        'Telegram profile photo download',
      );
      if (!Buffer.isBuffer(photo) || photo.length === 0) return null;
      return `data:image/jpeg;base64,${photo.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private mapInviteError(error: unknown): never {
    return this.channelResolution.mapInviteError(error);
  }

  public async resolveStoredChannel(
    client: TelegramClient,
    channel: StoredTelegramChannelReference,
    accessOnly = false,
  ): Promise<ResolvedStoredTelegramChannel> {
    return this.channelResolution.resolveStoredChannel(
      client,
      channel,
      accessOnly,
    );
  }

  async startLogin(
    apiId: string,
    apiHash: string,
    phone: string,
    forceSms = false,
  ) {
    return this.accounts.startLogin(apiId, apiHash, phone, forceSms);
  }

  async loginWithQr(
    apiId: string,
    apiHash: string,
    signal: AbortSignal,
    onProgress: (progress: TelegramQrLoginProgress) => void | Promise<void>,
  ) {
    return this.accounts.loginWithQr(apiId, apiHash, signal, onProgress);
  }

  async signInWithCode(params: {
    apiId: string;
    apiHash: string;
    phone: string;
    phoneCodeHash: string;
    code: string;
    tempSession?: string;
  }) {
    return this.accounts.signInWithCode(params);
  }

  async signInWithPassword(params: {
    apiId: string;
    apiHash: string;
    password: string;
    tempSession?: string;
  }) {
    return this.accounts.signInWithPassword(params);
  }

  async getAccountProfile(params: Required<TelegramMtprotoSessionCredentials>) {
    return this.accounts.getAccountProfile(params);
  }

  async getMe(params: { apiId: string; apiHash: string; session: string }) {
    return this.accounts.getMe(params);
  }

  async getAdminChannels(params: {
    apiId: string;
    apiHash: string;
    session: string;
  }) {
    return this.accounts.getAdminChannels(params);
  }

  async getAdminChannelsWithProfile(
    params: {
      apiId: string;
      apiHash: string;
      session: string;
    },
    options: { includeChannelPhotos?: boolean } = {},
  ) {
    return this.accounts.getAdminChannelsWithProfile(params, options);
  }

  async getPublicChannelInfo(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    inviteHash?: string;
    accessOnly?: boolean;
  }) {
    return this.channelResolution.getPublicChannelInfo(params);
  }

  async joinPrivateChannelByInvite(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef: string;
    inviteHash: string;
  }) {
    return this.channelResolution.joinPrivateChannelByInvite(params);
  }

  async findAccessibleChannelInfoByTitle(params: {
    apiId: string;
    apiHash: string;
    session: string;
    titleQuery: string;
  }) {
    return this.channelResolution.findAccessibleChannelInfoByTitle(params);
  }

  async getChannelHistorical(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    postLimit?: number;
    postsFrom?: Date | null;
    syncPosts?: boolean;
    syncInviteLinks?: boolean;
    inviteLinksCreatedFrom?: Date | null;
    onInviteLinksProgress?: InviteLinksProgressCallback;
    onInviteLinkLoaded?: InviteLinkLoadedCallback;
  }) {
    return this.channelHistory.getChannelHistorical(params);
  }

  async getBroadcastStats(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
  }) {
    return this.broadcastStatistics.getBroadcastStats(params);
  }

  public async getInviteAdminPhotoUrl(client: TelegramClient, user: Api.User) {
    return this.inviteAdminReader.getInviteAdminPhotoUrl(client, user);
  }

  private async loadChannelInviteAdminsDirectory(
    client: TelegramClient,
    entity: ImportableTelegramEntity,
    warnings: string[],
  ) {
    return this.inviteAdminReader.loadChannelInviteAdminsDirectory(
      client,
      entity,
      warnings,
    );
  }

  private async resolveInviteAdminInputUser(params: {
    client: TelegramClient;
    user: Api.User;
    selfUserId: string | null;
    channelTelegramId?: string | null;
    connectedTelegramUserId?: string | null;
  }) {
    return this.inviteAdminReader.resolveInviteAdminInputUser(params);
  }

  private async collectInviteLinksForAdmin(params: {
    client: TelegramClient;
    peer: ImportableTelegramEntity;
    adminId: Api.TypeInputUser;
    adminUser: Api.User;
    knownUsers: Map<string, Api.User>;
    revoked: boolean;
    expectedCount?: number;
    createdFrom?: Date | null;
    warnings: string[];
    onInviteLinkLoaded?: (
      link: TelegramInviteLinksResult['links'][number],
    ) => void | Promise<void>;
  }) {
    return this.inviteAdminReader.collectInviteLinksForAdmin(params);
  }

  private async getAllChannelInviteLinksInternal(
    client: TelegramClient,
    entity: ImportableTelegramEntity,
    onProgress?: InviteLinksProgressCallback,
    onInviteLinkLoaded?: InviteLinkLoadedCallback,
    createdFrom?: Date | null,
  ): Promise<TelegramInviteLinksResult> {
    return this.inviteLinks.getAllChannelInviteLinksInternal(
      client,
      entity,
      onProgress,
      onInviteLinkLoaded,
      createdFrom,
    );
  }

  async getAllChannelInviteLinks(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    onProgress?: InviteLinksProgressCallback;
  }) {
    return this.inviteLinks.getAllChannelInviteLinks(params);
  }

  async getChannelInviteLink(params: Parameters<TelegramMtprotoInviteLinks['getChannelInviteLink']>[0]) {
    return this.inviteLinks.getChannelInviteLink(params);
  }

  private async getInviteCreatorWithDetails(
    client: TelegramClient,
    fallback: Api.User,
  ) {
    return this.inviteAdminReader.getInviteCreatorWithDetails(client, fallback);
  }

  async getCustomEmojiPack(params: {
    apiId: string;
    apiHash: string;
    session: string;
    source: string;
  }): Promise<ResolvedTelegramCustomEmojiPack> {
    return this.emojiPacks.getCustomEmojiPack(params);
  }

  publishPost(params: TelegramPublishPostParams) {
    return this.publicationTransport.publishPost(params);
  }

  async editPostText(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
    imageCount: number;
    publishMode: string | null | undefined;
    captionHtml?: string;
    followupHtmlParts?: string[];
    textHtmlParts?: string[];
    scheduleAt?: Date | null;
  }) {
    return this.publicationTransport.editPostText(params);
  }

  async editPostPhotos(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
    imageUrls: string[];
    scheduleAt?: Date | null;
  }) {
    return this.publicationTransport.editPostPhotos(params);
  }

  private convertImageBufferWithSips(buffer: Buffer, contentType: string) {
    return this.publicationTransport.convertImageBufferWithSips(
      buffer,
      contentType,
    );
  }

  private downloadPublishImage(url: string, index: number) {
    return this.publicationTransport.downloadPublishImage(url, index);
  }

  async deleteScheduledPost(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
    scheduleAt?: Date;
  }) {
    return this.publicationTransport.deleteScheduledPost(params);
  }

  async deletePublishedMessages(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
  }) {
    return this.publicationTransport.deletePublishedMessages(params);
  }

  async getManagedPostMessages(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    publishedMessageIds: string[];
    scheduledMessageIds: string[];
    recentPublishedFrom?: Date;
    recentPublishedUntil?: Date;
  }): Promise<TelegramManagedPostHistory> {
    return this.publicationTransport.getManagedPostMessages(params);
  }

  async getScheduledHistory(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    requireDeletionAccess?: boolean;
  }): Promise<TelegramScheduledMessage[]> {
    return this.publicationTransport.getScheduledHistory(params);
  }

  async getScheduledMessagesByIds(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
  }): Promise<TelegramScheduledMessage[]> {
    return this.publicationTransport.getScheduledMessagesByIds(params);
  }

  async getChannelPostsMetrics(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds?: Array<string | number>;
    postLimit?: number;
    beforeMessageId?: string | number | null;
    postsFrom?: Date | null;
  }) {
    return this.channelHistory.getChannelPostsMetrics(params);
  }

  private async getChannelMessagesFromCutoff(
    client: TelegramClient,
    entity: unknown,
    params: TelegramHistoryCutoff,
  ) {
    return this.channelHistory.getChannelMessagesFromCutoff(
      client,
      entity,
      params,
    );
  }

  async downloadChannelMessagesMedia(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
  }) {
    return this.channelHistory.downloadChannelMessagesMedia(params);
  }
}
