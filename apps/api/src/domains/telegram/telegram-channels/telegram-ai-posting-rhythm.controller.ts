import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramAiPostingRhythmService } from './telegram-ai-posting-rhythm.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:id/ai-posting/rhythm')
export class TelegramAiPostingRhythmController {
  constructor(private readonly rhythm: TelegramAiPostingRhythmService) {}

  @Get()
  suggest(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.rhythm.suggest(user.sub, id);
  }

  @Post('apply')
  apply(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.rhythm.apply(user.sub, id);
  }
}
