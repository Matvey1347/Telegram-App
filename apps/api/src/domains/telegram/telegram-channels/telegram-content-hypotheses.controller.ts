import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  TelegramContentHypothesisInputDto,
  TelegramManagedPostHypothesesInputDto,
} from './telegram-content-hypotheses.dto';
import { TelegramContentHypothesesService } from './telegram-content-hypotheses.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:channelId')
export class TelegramContentHypothesesController {
  constructor(private readonly service: TelegramContentHypothesesService) {}
  @Get('content-hypotheses') list(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.list(user.sub, channelId);
  }
  @Get('content-hypotheses/post-options') postOptions(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.postOptions(user.sub, channelId);
  }
  @Post('content-hypotheses') create(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: TelegramContentHypothesisInputDto,
  ) {
    return this.service.create(user.sub, channelId, dto);
  }
  @Patch('content-hypotheses/:hypothesisId') update(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Param('hypothesisId') hypothesisId: string,
    @Body() dto: TelegramContentHypothesisInputDto,
  ) {
    return this.service.update(user.sub, channelId, hypothesisId, dto);
  }
  @Delete('content-hypotheses/:hypothesisId') remove(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Param('hypothesisId') hypothesisId: string,
  ) {
    return this.service.remove(user.sub, channelId, hypothesisId);
  }
  @Put('managed-posts/:postId/hypotheses') setPost(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Param('postId') postId: string,
    @Body() dto: TelegramManagedPostHypothesesInputDto,
  ) {
    return this.service.setPostHypotheses(user.sub, channelId, postId, dto);
  }
}
