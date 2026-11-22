import { ChannelAvatarEmojiProcessorService } from '../telegram-channels/channel-avatar-emoji-processor.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramSourceType,
  TelegramUserAccountStatus,
} from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramSourceAccessService } from '@api/telegram/shared/imports/telegram-source-access.service';
import {
  getTelegramFloodWaitSeconds,
  isTelegramSendCodeUnavailableError,
} from '@api/telegram/shared/mtproto/telegram-session-errors';
import {
  Confirm2faPasswordDto,
  ConfirmLoginCodeDto,
  CreateTelegramUserAccountDto,
  ImportUserAccountChannelsDto,
  StartLoginDto,
  UpdateTelegramUserAccountDto,
} from './dto';
import { ConfigService } from '@nestjs/config';
import { TelegramChannelImportPolicyService } from '../telegram-channels/telegram-channel-import-policy.service';
import { TelegramChannelSyncOrchestrator } from '../telegram-channels/telegram-channel-sync.orchestrator';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import type { TelegramQrLoginProgress } from '@telegram-system/shared';
import {
  telegramAccountCapabilityUpdate,
  TelegramUserAccountLoginFinalizer,
} from './telegram-user-account-login-finalizer';
import { TelegramUserAccountQrLoginService } from './telegram-user-account-qr-login.service';
import { TelegramUserAccountRemovalService } from './telegram-user-account-removal.service';
import {
  decryptTelegramLoginTempSession,
  encryptTelegramLoginTempSession,
  maskTelegramLoginPhone,
  safeTelegramUserAccount,
  updateTelegramLoginStateIfCurrent,
} from './telegram-user-account-login-state';
import { TelegramUserAccountCapabilityRefreshService } from './telegram-user-account-capability-refresh.service';
import { TelegramAccountRuntimeNotifier } from '../../../common/telegram-account-runtime-notifier.service';
import { decryptTelegramMtprotoCredentials } from '@api/telegram/shared/mtproto/telegram-mtproto-credentials';
import { type TelegramUserAccountProgressCallback } from './telegram-user-account-import-progress';
import { syncDialogsThenWakeTelegramRuntime } from './telegram-user-account-login-runtime';

import { importTelegramUserAccountChannels } from './telegram-user-account-channel-import';
import {
  reconcileWorkspaceAccountDialogs,
  syncTelegramUserAccountDialogs,
} from './telegram-user-account-dialog-sync';

type ProgressCallback = TelegramUserAccountProgressCallback;

@Injectable()
export class TelegramUserAccountsService {
  private readonly logger = new Logger(TelegramUserAccountsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryptionService: TokenEncryptionService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly configService: ConfigService,
    private readonly telegramChannelImportPolicyService: TelegramChannelImportPolicyService,
    private readonly telegramChannelSyncOrchestrator: TelegramChannelSyncOrchestrator,
    private readonly loginFinalizer: TelegramUserAccountLoginFinalizer,
    private readonly qrLoginService: TelegramUserAccountQrLoginService,
    private readonly applicationLogger: ApplicationLoggerService = {
      info: () => undefined,
      writeStructured: () => undefined,
    } as unknown as ApplicationLoggerService,
    private readonly accountRemoval: TelegramUserAccountRemovalService = new TelegramUserAccountRemovalService(
      prisma,
      workspaceService,
    ),
    private readonly capabilityRefresh: TelegramUserAccountCapabilityRefreshService = new TelegramUserAccountCapabilityRefreshService(
      prisma,
      encryptionService,
      mtprotoClient,
      applicationLogger,
      new TelegramAccountRuntimeNotifier(),
    ),
    private readonly runtimeNotifier: TelegramAccountRuntimeNotifier = new TelegramAccountRuntimeNotifier(),
    private readonly avatarEmojis?: ChannelAvatarEmojiProcessorService,
  ) {}

  private async updateLoginState(
    account: Parameters<typeof updateTelegramLoginStateIfCurrent>[1],
    data: Parameters<typeof updateTelegramLoginStateIfCurrent>[2],
  ) {
    await updateTelegramLoginStateIfCurrent(this.prisma, account, data);
    this.runtimeNotifier.wake({
      workspaceId: account.workspaceId,
      accountId: account.id,
      reason: 'credentials',
    });
  }

  private decryptPhone(account: {
    phoneEncrypted?: string | null;
    phoneIv?: string | null;
    phoneAuthTag?: string | null;
  }) {
    if (!account.phoneEncrypted || !account.phoneIv || !account.phoneAuthTag) {
      return null;
    }
    return this.encryptionService.decrypt({
      encrypted: account.phoneEncrypted,
      iv: account.phoneIv,
      authTag: account.phoneAuthTag,
    });
  }

  private async getWorkspaceId(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private async syncDialogsAfterConnect(userId: string, id: string) {
    try {
      return await this.syncDialogs(userId, id);
    } catch (error) {
      this.logger.warn(
        `MTProto channel access auto-sync skipped for account=${id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        success: false,
        message:
          'Account connected, but channel access auto-sync failed. Run Sync channels manually.',
        channels: [],
      };
    }
  }

  private resolveApiCredentials(dto: CreateTelegramUserAccountDto) {
    const apiId = this.configService.get<string>('TELEGRAM_API_ID');
    const apiHash = this.configService.get<string>('TELEGRAM_API_HASH');
    if (!apiId || !apiHash) {
      throw new BadRequestException(
        'API ID/API Hash not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env',
      );
    }
    return { apiId, apiHash };
  }

  async findAll(userId: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const rows = await this.prisma.telegramUserAccountIntegration.findMany({
      where: { workspaceId },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
      },
      orderBy: { createdAt: 'desc' },
    });
    const refreshed = await this.capabilityRefresh.refreshMany(rows);
    return rows.map((row) =>
      safeTelegramUserAccount(
        (refreshed.get(row.id) as Record<string, unknown>) || row,
      ),
    );
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const row = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
      },
    });
    if (!row) throw new NotFoundException('Telegram user account not found');
    return safeTelegramUserAccount(row);
  }

  async channels(userId: string, id: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');
    return this.sourceAccessService.channelsForSource(
      workspaceId,
      id,
      TelegramSourceType.MTPROTO,
    );
  }

  async create(userId: string, dto: CreateTelegramUserAccountDto) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const creds = this.resolveApiCredentials(dto);
    const apiHash = this.encryptionService.encrypt(creds.apiHash);
    const encryptedPhone = this.encryptionService.encrypt(dto.phone);
    const row = await this.prisma.telegramUserAccountIntegration.create({
      data: {
        workspaceId,
        label: dto.label?.trim() || `TG ${maskTelegramLoginPhone(dto.phone)}`,
        apiId: creds.apiId,
        apiHashEncrypted: apiHash.encrypted,
        apiHashIv: apiHash.iv,
        apiHashAuthTag: apiHash.authTag,
        phoneEncrypted: encryptedPhone.encrypted,
        phoneIv: encryptedPhone.iv,
        phoneAuthTag: encryptedPhone.authTag,
        phoneMasked: maskTelegramLoginPhone(dto.phone),
        status: TelegramUserAccountStatus.pending,
        assignedMemberId,
        createdByUserId: userId,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
      },
    });
    return safeTelegramUserAccount(row);
  }

  async update(userId: string, id: string, dto: UpdateTelegramUserAccountDto) {
    const workspaceId = await this.getWorkspaceId(userId);
    const existing = await this.prisma.telegramUserAccountIntegration.findFirst(
      { where: { id, workspaceId } },
    );
    if (!existing)
      throw new NotFoundException('Telegram user account not found');
    const data: Record<string, unknown> = {
      label: dto.label,
      apiId: dto.apiId,
      isActive: dto.isActive,
    };
    if (dto.assignedMemberId !== undefined) {
      data.assignedMemberId = (
        await this.workspaceService.resolveAssignedMemberId(
          userId,
          dto.assignedMemberId,
        )
      ).assignedMemberId;
    }
    if (dto.apiHash) {
      const encrypted = this.encryptionService.encrypt(dto.apiHash);
      data.apiHashEncrypted = encrypted.encrypted;
      data.apiHashIv = encrypted.iv;
      data.apiHashAuthTag = encrypted.authTag;
    }
    if (dto.isPriorityPublisher !== undefined) {
      if (
        dto.isPriorityPublisher &&
        (!existing.isActive ||
          existing.status !== TelegramUserAccountStatus.connected ||
          !existing.mtprotoPublishingEnabled)
      ) {
        throw new BadRequestException(
          'A priority publisher must be connected, active, and enabled for publishing.',
        );
      }
      await this.prisma.$transaction(async (tx) => {
        if (dto.isPriorityPublisher) {
          await tx.telegramUserAccountIntegration.updateMany({
            where: { workspaceId, isPriorityPublisher: true },
            data: { isPriorityPublisher: false },
          });
        }
        await tx.telegramUserAccountIntegration.update({
          where: { id },
          data: { isPriorityPublisher: dto.isPriorityPublisher },
        });
      });
    }
    const row = await this.prisma.telegramUserAccountIntegration.update({
      where: { id },
      data,
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
      },
    });
    if (
      dto.isActive !== undefined ||
      dto.apiId !== undefined ||
      dto.apiHash !== undefined
    ) {
      this.runtimeNotifier.wake({
        workspaceId,
        accountId: id,
        reason: 'credentials',
      });
    }
    return safeTelegramUserAccount(row);
  }

  async remove(userId: string, id: string) {
    return this.accountRemoval.remove(userId, id);
  }

  async startLogin(userId: string, id: string, dto: StartLoginDto) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const phone =
      dto.phone ||
      (account.phoneEncrypted && account.phoneIv && account.phoneAuthTag
        ? this.encryptionService.decrypt({
            encrypted: account.phoneEncrypted,
            iv: account.phoneIv,
            authTag: account.phoneAuthTag,
          })
        : null);
    if (!phone)
      throw new BadRequestException('Phone is required to start login.');
    let started: Awaited<ReturnType<TelegramMtprotoClient['startLogin']>>;
    let smsUnavailable = false;
    try {
      started = await this.mtprotoClient.startLogin(
        account.apiId,
        apiHash,
        phone,
        dto.delivery === 'SMS',
      );
    } catch (error) {
      const retryAfterSeconds = getTelegramFloodWaitSeconds(error);
      if (retryAfterSeconds != null) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: `Telegram rate limit reached. Try again in ${retryAfterSeconds} seconds.`,
            code: 'TELEGRAM_FLOOD_WAIT',
            details: { retryAfterSeconds },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (isTelegramSendCodeUnavailableError(error)) {
        smsUnavailable = true;
        started = await this.mtprotoClient.startLogin(
          account.apiId,
          apiHash,
          phone,
        );
      } else {
        throw error;
      }
    }
    const loginTempSession = encryptTelegramLoginTempSession(
      this.encryptionService,
      started.tempSession,
    );

    await this.updateLoginState(account, {
      status: TelegramUserAccountStatus.needs_code,
      lastErrorMessage: null,
      lastCheckedAt: new Date(),
      phoneMasked: maskTelegramLoginPhone(phone),
      loginPhoneCodeHash: started.phoneCodeHash,
      loginStartedAt: new Date(),
      loginTempSessionEncrypted: loginTempSession?.loginTempSessionEncrypted,
      loginTempSessionIv: loginTempSession?.loginTempSessionIv,
      loginTempSessionAuthTag: loginTempSession?.loginTempSessionAuthTag,
    });
    return {
      success: true,
      status: TelegramUserAccountStatus.needs_code,
      isCodeViaApp: started.isCodeViaApp,
      ...(smsUnavailable ? { smsUnavailable: true } : {}),
    };
  }

  async confirmCode(userId: string, id: string, dto: ConfirmLoginCodeDto) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');

    const statePhoneCodeHash = account.loginPhoneCodeHash;
    const stateTempSession = decryptTelegramLoginTempSession(
      this.encryptionService,
      account,
    );
    if (!statePhoneCodeHash) {
      await this.updateLoginState(account, {
        status: TelegramUserAccountStatus.error,
        lastErrorMessage: 'Login session expired. Start login again.',
        loginPhoneCodeHash: null,
        loginTempSessionEncrypted: null,
        loginTempSessionIv: null,
        loginTempSessionAuthTag: null,
        loginStartedAt: null,
      });
      return { success: false, status: TelegramUserAccountStatus.error };
    }

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const phone = this.decryptPhone(account);
    if (!phone) {
      throw new BadRequestException('Phone is required to confirm login code.');
    }
    const result = await this.mtprotoClient.signInWithCode({
      apiId: account.apiId,
      apiHash,
      phone,
      phoneCodeHash: statePhoneCodeHash,
      code: dto.code,
      tempSession: stateTempSession ?? undefined,
    });

    if (result.needsPassword) {
      await this.updateLoginState(account, {
        status: TelegramUserAccountStatus.needs_password,
        lastErrorMessage: null,
        loginPhoneCodeHash: statePhoneCodeHash,
        ...(result.tempSession
          ? encryptTelegramLoginTempSession(
              this.encryptionService,
              result.tempSession,
            )
          : {}),
      });
      return {
        success: true,
        status: TelegramUserAccountStatus.needs_password,
      };
    }
    if (!result.me || !result.session) {
      throw new BadRequestException('Telegram authorization failed');
    }

    const row = await this.loginFinalizer.finalize(account, {
      session: result.session,
      profile: result.me,
    });
    const channelSync = await syncDialogsThenWakeTelegramRuntime(
      workspaceId,
      account.id,
      () => this.syncDialogsAfterConnect(userId, account.id),
      this.runtimeNotifier,
    );
    const safeRow = safeTelegramUserAccount(
      row as unknown as Record<string, unknown>,
    );
    return { ...safeRow, channelSync };
  }

  async confirmPassword(
    userId: string,
    id: string,
    dto: Confirm2faPasswordDto,
  ) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');

    const stateTempSession = decryptTelegramLoginTempSession(
      this.encryptionService,
      account,
    );
    if (
      account.status !== TelegramUserAccountStatus.needs_password ||
      !stateTempSession
    ) {
      await this.updateLoginState(account, {
        status: TelegramUserAccountStatus.error,
        lastErrorMessage: 'Login session expired. Start login again.',
        loginPhoneCodeHash: null,
        loginTempSessionEncrypted: null,
        loginTempSessionIv: null,
        loginTempSessionAuthTag: null,
        loginStartedAt: null,
      });
      return { success: false, status: TelegramUserAccountStatus.error };
    }

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const result = await this.mtprotoClient.signInWithPassword({
      apiId: account.apiId,
      apiHash,
      password: dto.password,
      tempSession: stateTempSession ?? undefined,
    });
    const row = await this.loginFinalizer.finalize(account, {
      session: result.session,
      profile: result.me,
    });
    const channelSync = await syncDialogsThenWakeTelegramRuntime(
      workspaceId,
      account.id,
      () => this.syncDialogsAfterConnect(userId, account.id),
      this.runtimeNotifier,
    );
    const safeRow = safeTelegramUserAccount(
      row as unknown as Record<string, unknown>,
    );
    return { ...safeRow, channelSync };
  }

  async loginWithQr(
    userId: string,
    id: string,
    onProgress: (progress: TelegramQrLoginProgress) => void | Promise<void>,
    signal: AbortSignal,
  ) {
    return this.qrLoginService.login(userId, id, onProgress, signal, async () =>
      syncDialogsThenWakeTelegramRuntime(
        await this.getWorkspaceId(userId),
        id,
        () => this.syncDialogsAfterConnect(userId, id),
        this.runtimeNotifier,
      ),
    );
  }

  async check(userId: string, id: string, reconcileChannels = false) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');

    if (
      !account.sessionEncrypted ||
      !account.sessionIv ||
      !account.sessionAuthTag
    ) {
      const row = await this.prisma.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          status: TelegramUserAccountStatus.pending,
          lastCheckedAt: new Date(),
          lastErrorMessage: 'Account is not connected yet',
        },
      });
      this.runtimeNotifier.wake({
        workspaceId,
        accountId: account.id,
        reason: 'credentials',
      });
      return safeTelegramUserAccount(row);
    }

    const row =
      (await this.capabilityRefresh.refreshOne(account, {
        force: true,
      })) ||
      (await this.prisma.telegramUserAccountIntegration.findFirstOrThrow({
        where: { id: account.id, workspaceId },
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      }));
    if (
      reconcileChannels &&
      row.status === TelegramUserAccountStatus.connected
    ) {
      await this.syncDialogs(userId, id, undefined, true);
    }
    return safeTelegramUserAccount(row);
  }

  async syncDialogs(
    userId: string,
    id: string,
    onProgress?: ProgressCallback,
    reconcilePeers = false,
  ) {
    const workspaceId = await this.getWorkspaceId(userId);
    const sync = reconcilePeers
      ? reconcileWorkspaceAccountDialogs
      : syncTelegramUserAccountDialogs;
    return sync(
      {
        prisma: this.prisma,
        mtprotoClient: this.mtprotoClient,
        encryptionService: this.encryptionService,
        sourceAccessService: this.sourceAccessService,
        avatarEmojis: this.avatarEmojis,
      },
      workspaceId,
      id,
      onProgress,
    );
  }

  async importChannels(
    userId: string,
    id: string,
    dto: ImportUserAccountChannelsDto,
    onProgress?: ProgressCallback,
  ) {
    const workspaceId = await this.getWorkspaceId(userId);
    return importTelegramUserAccountChannels(
      {
        prisma: this.prisma,
        encryptionService: this.encryptionService,
        mtprotoClient: this.mtprotoClient,
        sourceAccessService: this.sourceAccessService,
        telegramChannelImportPolicyService:
          this.telegramChannelImportPolicyService,
        telegramChannelSyncOrchestrator: this.telegramChannelSyncOrchestrator,
        avatarEmojis: this.avatarEmojis,
      },
      workspaceId,
      userId,
      id,
      dto,
      onProgress,
    );
  }
}
