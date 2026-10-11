import { Injectable } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import type { TelegramBotApplicationPresentation } from '@api/domains/telegram/telegram-bots/core/telegram-bot-application.ports';
import { publicWebOrigin } from '@api/config/deployment-config';
@Injectable()
export class SimpleFinancePresentationService implements TelegramBotApplicationPresentation {
  readonly applicationType=TelegramBotApplicationType.SIMPLE_FINANCE;
  commands(){return [{command:'start',description:'Відкрити Finance'}]}
  supportedLocales(){return ['uk'] as const}
  menuButton(botId:string){return {type:'web_app' as const,text:'Finance',webAppUrl:this.miniAppUrl(botId)!}}
  miniAppUrl(botId:string){const origin=publicWebOrigin();return origin?`${origin}/simple-finance/${botId}`:null}
  resolveLocale(){return 'uk'}
}
