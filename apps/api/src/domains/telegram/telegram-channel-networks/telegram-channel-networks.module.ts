import { Module } from '@nestjs/common';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { TelegramChannelNetworksController } from './telegram-channel-networks.controller';
import { TelegramChannelNetworksService } from './telegram-channel-networks.service';
import { TelegramNetworkPerformanceHistoryService } from './telegram-network-performance-history.service';

@Module({
  imports: [TelegramChannelsModule],
  controllers: [TelegramChannelNetworksController],
  providers: [TelegramChannelNetworksService, TelegramNetworkPerformanceHistoryService],
})
export class TelegramChannelNetworksModule {}
