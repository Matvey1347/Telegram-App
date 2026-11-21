import {
  Body,
  Controller,
  Delete,
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
  CreateTelegramAdSaleDto,
  CreateTelegramAdSaleCheckoutDto,
  TelegramAdSalesBulkCreateDto,
  UpdateTelegramAdSaleDto,
  TelegramAdSaleEditWorkflowDto,
} from './dto';
import { TelegramAdSalesBulkService } from './telegram-ad-sales-bulk.service';
import { TelegramAdSalesCheckoutService } from './telegram-ad-sales-checkout.service';
import { TelegramAdSalesEditWorkflowService } from './telegram-ad-sales-edit-workflow.service';
import { TelegramAdSalesService } from './telegram-ad-sales.service';
import { TelegramAdSaleBotNotificationService } from './telegram-ad-sale-bot-notification.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-ad-sales')
export class TelegramAdSalesController {
  constructor(
    private readonly service: TelegramAdSalesService,
    private readonly bulkService: TelegramAdSalesBulkService,
    private readonly checkoutService: TelegramAdSalesCheckoutService,
    private readonly editWorkflowService: TelegramAdSalesEditWorkflowService,
    private readonly botConfirmation: TelegramAdSaleBotNotificationService,
    private readonly streamResponse: StreamResponseService,
  ) {}

  @Get(':saleId/bot-notification-preview')
  botNotificationPreview(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
  ) {
    return this.botConfirmation.preview(user.sub, saleId);
  }

  @Post(':saleId/send-to-bot')
  sendToBot(@CurrentUser() user: JwtUser, @Param('saleId') saleId: string) {
    return this.botConfirmation.send(user.sub, saleId);
  }

  @Post('bulk')
  bulkCreate(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdSalesBulkCreateDto,
  ) {
    return this.bulkService.create(user.sub, dto);
  }

  @Post('checkout')
  createPaidReservedSale(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramAdSaleCheckoutDto,
  ) {
    return this.checkoutService.create(user.sub, dto);
  }

  @Post('checkout-workflow')
  createPaidReservedSaleWorkflow(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramAdSaleCheckoutDto,
    @Res() res: Response,
  ) {
    return this.streamResponse.stream(res, {
      eventPrefix: 'telegram_ad_sales.checkout_workflow',
      persistLifecycleLogs: false,
      action: (onProgress) =>
        this.checkoutService.createWorkflow(user.sub, dto, onProgress),
    });
  }

  @Get(':id')
  getSale(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.getSale(user.sub, id);
  }

  @Post()
  createSale(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramAdSaleDto,
  ) {
    return this.service.createSale(user.sub, dto);
  }

  @Patch(':id')
  updateSale(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramAdSaleDto,
  ) {
    return this.service.updateSale(user.sub, id, dto);
  }

  @Post(':saleId/edit-workflow')
  saveSaleWorkflow(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Body() dto: TelegramAdSaleEditWorkflowDto,
    @Res() res: Response,
  ) {
    return this.streamResponse.stream(res, {
      eventPrefix: 'telegram_ad_sales.edit_workflow',
      persistLifecycleLogs: false,
      action: (onProgress) =>
        this.editWorkflowService.save(user.sub, saleId, dto, onProgress),
    });
  }

  @Delete(':id')
  deleteSale(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deleteSale(user.sub, id);
  }
}
