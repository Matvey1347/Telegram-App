import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../../common/current-user.decorator';
import type { JwtUser } from '../../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/jwt-auth.guard';
import {
  CreateTelegramBotDto,
  SwitchTelegramBotApplicationDto,
  UpdateTelegramBotDto,
  UpsertTelegramBotRuntimeDto,
} from './dto';
import { TelegramBotsService } from './telegram-bots.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-bots')
export class TelegramBotsController {
  constructor(private readonly service: TelegramBotsService) {}

  @Get() findAll(@CurrentUser() user: JwtUser) {
    return this.service.findAll(user.sub);
  }

  @Post() create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramBotDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Get(':id') findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }

  @Patch(':id') update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramBotDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Post(':id/application') switchApplication(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SwitchTelegramBotApplicationDto,
  ) {
    return this.service.switchApplication(user.sub, id, dto);
  }

  @Post(':id/runtimes/:environment')
  upsertRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
    @Body() dto: UpsertTelegramBotRuntimeDto,
  ) {
    return this.service.upsertRuntime(user.sub, id, environment, dto);
  }

  @Post(':id/runtimes/:environment/check')
  checkRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
  ) {
    return this.service.checkRuntime(user.sub, id, environment);
  }

  @Post(':id/runtimes/:environment/enable')
  enableRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
  ) {
    return this.service.enableRuntime(user.sub, id, environment);
  }

  @Post(':id/runtimes/:environment/disable')
  disableRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
  ) {
    return this.service.disableRuntime(user.sub, id, environment);
  }

  @Delete(':id/runtimes/:environment')
  removeRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
  ) {
    return this.service.removeRuntime(user.sub, id, environment);
  }

  @Get(':id/channels') channels(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.channels(user.sub, id);
  }

  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
