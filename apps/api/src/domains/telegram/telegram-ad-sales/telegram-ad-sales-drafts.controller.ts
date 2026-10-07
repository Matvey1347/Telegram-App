import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { SaveTelegramAdSaleDraftDto } from './dto';
import { TelegramAdSalesDraftsService } from './telegram-ad-sales-drafts.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-ad-sales/drafts')
export class TelegramAdSalesDraftsController {
  constructor(private readonly drafts: TelegramAdSalesDraftsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.drafts.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: SaveTelegramAdSaleDraftDto) {
    return this.drafts.create(user.sub, dto);
  }

  @Patch(':draftId')
  update(
    @CurrentUser() user: JwtUser,
    @Param('draftId') draftId: string,
    @Body() dto: SaveTelegramAdSaleDraftDto,
  ) {
    return this.drafts.update(user.sub, draftId, dto);
  }

  @Delete(':draftId')
  delete(@CurrentUser() user: JwtUser, @Param('draftId') draftId: string) {
    return this.drafts.delete(user.sub, draftId);
  }
}
