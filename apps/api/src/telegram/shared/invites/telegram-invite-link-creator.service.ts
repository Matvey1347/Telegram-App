import { BadRequestException, Injectable } from '@nestjs/common';
import { Api } from 'telegram';
import { normalizeTelegramUsername } from '@api/telegram/shared/imports/telegram-import.helpers';
import {
  TelegramMtprotoClient,
  type StoredTelegramChannelReference,
  type TelegramInviteLinksResult,
} from '@api/telegram/shared/mtproto/telegram-mtproto.client';

@Injectable()
export class TelegramInviteLinkCreatorService {
  constructor(private readonly mtproto: TelegramMtprotoClient) {}

  async create(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channel: StoredTelegramChannelReference;
    title: string;
  }): Promise<TelegramInviteLinksResult['links'][number]> {
    const client = await this.mtproto.createClient(params);
    try {
      const resolved = await this.mtproto.resolveStoredChannel(
        client,
        params.channel,
      );
      let response: unknown;
      try {
        response = await this.mtproto.withTimeout(
          client.invoke(
            new Api.messages.ExportChatInvite({
              peer: resolved.peer,
              title: params.title,
            }),
          ),
          20_000,
          'Telegram invite-link creation',
        );
      } catch (error) {
        throw this.inviteError(error);
      }
      const invite = this.mtproto.unwrapExportedChatInvite(response);
      const url = String(invite?.link || '').trim();
      const creatorTelegramUserId = this.mtproto
        .toBigInt(invite?.adminId)
        ?.toString();
      if (!invite || !url || !creatorTelegramUserId) {
        throw new BadRequestException(
          'Telegram did not return the created invite link.',
        );
      }
      const users = Array.isArray((response as { users?: unknown[] })?.users)
        ? (response as { users: unknown[] }).users
        : [];
      const creator = users.find(
        (user): user is Api.User =>
          user instanceof Api.User && String(user.id) === creatorTelegramUserId,
      );
      return {
        url,
        title:
          typeof invite.title === 'string' && invite.title.trim()
            ? invite.title
            : params.title,
        telegramCreatorUserId: creatorTelegramUserId,
        creatorUsername: creator ? normalizeTelegramUsername(creator.username) : null,
        creatorFirstName: creator?.firstName || null,
        creatorLastName: creator?.lastName || null,
        creatorPhotoUrl: creator
          ? await this.mtproto.getInviteAdminPhotoUrl(client, creator)
          : null,
        createdAt: this.mtproto.toTelegramDate(invite.date),
        startDate: this.mtproto.toTelegramDate(invite.startDate),
        expireDate: this.mtproto.toTelegramDate(invite.expireDate),
        usageLimit: this.mtproto.toFiniteNumber(invite.usageLimit),
        usage: this.mtproto.toFiniteNumber(invite.usage) ?? 0,
        requested: this.mtproto.toFiniteNumber(invite.requested) ?? 0,
        requestNeeded: Boolean(invite.requestNeeded),
        permanent: Boolean(invite.permanent),
        revoked: Boolean(invite.revoked),
      };
    } finally {
      await this.mtproto.closeClient(client);
    }
  }

  private inviteError(error: unknown) {
    if (error instanceof BadRequestException) return error;
    return new BadRequestException(
      'Telegram could not create the invite link. Check the account permissions.',
    );
  }
}
