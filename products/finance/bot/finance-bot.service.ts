import { Injectable } from '@nestjs/common';
import { TelegramBotUsersService } from '@api/domains/telegram/telegram-bots/core/telegram-bot-users.service';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import type { TelegramBotApplicationContext } from '@api/domains/telegram/telegram-bots/core/telegram-bot-update.types';
import { publicWebOrigin } from '@api/config/deployment-config';
@Injectable()
export class SimpleFinanceBotService {
  constructor(private readonly users: TelegramBotUsersService, private readonly botApi: TelegramBotApiClient) {}
  async handle(context: TelegramBotApplicationContext) {
    const actor=this.users.actorFromUpdate(context.update); if(!actor?.id)return;
    const user=await this.users.upsertFromUpdate({workspaceId:context.bot.workspaceId,botIntegrationId:context.bot.id,runtimeInstanceId:context.runtime.id,update:context.update});
    if(!user?.telegramChatId)return;
    const text=context.update.message?.text;
    if (text?.startsWith('/start')) await this.botApi.sendMessage(context.token,{chat_id:user.telegramChatId,text:'👛 <b>Finance</b>\nПростий щоденний облік грошей: рахунки, витрати, доходи та перекази.',parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'Відкрити Finance',web_app:{url:`${publicWebOrigin() ?? ''}/simple-finance/${context.bot.id}`}}]]}});
  }
}
