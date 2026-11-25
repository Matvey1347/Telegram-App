import { TelegramChannelNetworksModule } from '../telegram-channel-networks/telegram-channel-networks.module';
import { Module } from '@nestjs/common';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import {
  BotAdRedirectController,
  BotAdsController,
} from './bot-ads.controller';
import { BotAdsService } from './bot-ads.service';

@Module({
  imports: [TelegramChannelsModule, TelegramChannelNetworksModule],
  controllers: [BotAdsController, BotAdRedirectController],
  providers: [BotAdsService],
})
export class BotAdsModule {}
