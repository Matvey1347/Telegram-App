import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramPublicationOccurrenceQueryDto, TelegramPublicationScheduleAssignmentInputDto, TelegramPublicationScheduleInputDto } from './telegram-publication-schedules.dto';
import { TelegramPublicationSchedulesService } from './telegram-publication-schedules.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-publication-schedules')
export class TelegramPublicationSchedulesController {
  constructor(private readonly service: TelegramPublicationSchedulesService) {}
  @Get() list(@CurrentUser() user: JwtUser) { return this.service.list(user.sub); }
  @Post() create(@CurrentUser() user: JwtUser, @Body() dto: TelegramPublicationScheduleInputDto) { return this.service.create(user.sub, dto); }
  @Patch(':id') update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: TelegramPublicationScheduleInputDto) { return this.service.update(user.sub, id, dto); }
  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.service.remove(user.sub, id); }
}

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:channelId/publication-schedule')
export class TelegramChannelPublicationScheduleController {
  constructor(private readonly service: TelegramPublicationSchedulesService) {}
  @Get('occurrences') occurrences(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string, @Query() query: TelegramPublicationOccurrenceQueryDto) { return this.service.occurrences(user.sub, channelId, query); }
  @Get() get(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string) { return this.service.assignment(user.sub, channelId); }
  @Put() put(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string, @Body() dto: TelegramPublicationScheduleAssignmentInputDto) { return this.service.assign(user.sub, channelId, dto); }
}
