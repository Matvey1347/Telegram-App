import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { StreamResponseService } from '../../../common/stream/stream-response.service';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  AttachPlacementManagedPostDto,
  CancelPlacementDto,
  CompletePermanentPlacementDto,
  CreateTelegramAdSalePlacementDto,
  CreatePlacementManagedPostDto,
  PublishPlacementDto,
  ReserveTelegramAdSaleDto,
  ReschedulePlacementDto,
  RetryPlacementDeletionDto,
  SchedulePlacementDto,
  ScheduleSaleDto,
  UpdateTelegramAdSalePlacementDto,
} from './dto';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-ad-sales')
export class TelegramAdSalesPlacementController {
  constructor(
    private readonly service: TelegramAdSalesService,
    private readonly streamResponse: StreamResponseService,
  ) {}

  @Post(':id/placements')
  addPlacement(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdSalePlacementDto,
  ) {
    return this.service.addPlacement(user.sub, id, dto);
  }

  @Patch(':saleId/placements/:placementId')
  updatePlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: UpdateTelegramAdSalePlacementDto,
  ) {
    return this.service.updatePlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':id/reserve')
  reserve(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ReserveTelegramAdSaleDto,
  ) {
    return this.service.reserveSale(user.sub, id, dto);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.confirmSale(user.sub, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.cancelSale(user.sub, id);
  }

  @Post(':saleId/placements/:placementId/managed-post')
  createManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: CreatePlacementManagedPostDto,
  ) {
    return this.service.createManagedPostFromPlacement(
      user.sub,
      saleId,
      placementId,
      dto,
    );
  }

  @Post(':saleId/placements/:placementId/attach-managed-post')
  attachManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: AttachPlacementManagedPostDto,
  ) {
    return this.service.attachManagedPost(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/placements/:placementId/detach-managed-post')
  detachManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
  ) {
    return this.service.detachManagedPost(user.sub, saleId, placementId);
  }

  @Post(':saleId/placements/:placementId/schedule')
  schedulePlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: SchedulePlacementDto,
  ) {
    return this.service.schedulePlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/recreate-scheduled-posts-via-bot')
  recreateScheduledPostsViaBot(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
  ) {
    return this.service.recreateScheduledPostsViaBot(user.sub, saleId);
  }

  @Post(':saleId/schedule')
  scheduleSale(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Body() dto: ScheduleSaleDto,
  ) {
    return this.service.scheduleSale(user.sub, saleId, dto);
  }

  @Post(':saleId/placements/:placementId/publish')
  publishPlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: PublishPlacementDto,
  ) {
    return this.service.publishPlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/placements/:placementId/reconcile-published')
  reconcilePublishedPlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
  ) {
    return this.service.reconcilePublishedPlacement(
      user.sub,
      saleId,
      placementId,
    );
  }

  @Post(':saleId/placements/:placementId/reschedule')
  reschedulePlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: ReschedulePlacementDto,
  ) {
    return this.service.reschedulePlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/placements/:placementId/cancel')
  cancelPlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: CancelPlacementDto,
  ) {
    return this.service.cancelPlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/cancel-publications')
  cancelSalePublications(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Res() response: Response,
  ) {
    return this.streamResponse.stream(response, {
      eventPrefix: 'telegram_ad_sales.delete_publications',
      persistLifecycleLogs: false,
      action: (onProgress, signal) =>
        this.service.cancelSalePublications(
          user.sub,
          saleId,
          onProgress,
          signal,
        ),
    });
  }

  @Post(':saleId/placements/:placementId/complete-permanent')
  completePermanentPlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: CompletePermanentPlacementDto,
  ) {
    return this.service.completePermanentPlacement(
      user.sub,
      saleId,
      placementId,
      dto,
    );
  }

  @Post(':saleId/placements/:placementId/retry-deletion')
  retryDeletion(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: RetryPlacementDeletionDto,
  ) {
    return this.service.retryDeletion(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/reconcile')
  reconcileSale(@CurrentUser() user: JwtUser, @Param('saleId') saleId: string) {
    return this.service.reconcileSale(user.sub, saleId);
  }

  @Get(':saleId/metrics')
  saleMetrics(@CurrentUser() user: JwtUser, @Param('saleId') saleId: string) {
    return this.service.saleMetrics(user.sub, saleId);
  }
}
