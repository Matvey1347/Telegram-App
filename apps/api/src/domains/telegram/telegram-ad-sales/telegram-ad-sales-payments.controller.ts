import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  CreateTelegramAdSalePaymentDto,
  DeleteTelegramAdSalePaymentQueryDto,
  UpdateTelegramAdSalePaymentDto,
  VoidTelegramAdSalePaymentDto,
} from './dto';
import { TelegramAdSalePaymentDeletionService } from './telegram-ad-sale-payment-deletion.service';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-ad-sales')
export class TelegramAdSalesPaymentsController {
  constructor(
    private readonly service: TelegramAdSalesService,
    private readonly paymentDeletion: TelegramAdSalePaymentDeletionService,
  ) {}

  @Post(':saleId/payments')
  createPayment(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Body() dto: CreateTelegramAdSalePaymentDto,
  ) {
    return this.service.createPayment(user.sub, saleId, dto);
  }

  @Get(':saleId/payments')
  listPayments(@CurrentUser() user: JwtUser, @Param('saleId') saleId: string) {
    return this.service.listPayments(user.sub, saleId);
  }

  @Patch(':saleId/payments/:paymentId')
  updatePayment(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateTelegramAdSalePaymentDto,
  ) {
    return this.service.updatePayment(user.sub, saleId, paymentId, dto);
  }

  @Post(':saleId/payments/:paymentId/void')
  voidPayment(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: VoidTelegramAdSalePaymentDto,
  ) {
    return this.service.voidPayment(user.sub, saleId, paymentId, dto);
  }

  @Delete(':saleId/payments/:paymentId')
  deletePayment(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('paymentId') paymentId: string,
    @Query() query: DeleteTelegramAdSalePaymentQueryDto,
  ) {
    return this.paymentDeletion.deleteActivePayment(
      user.sub,
      saleId,
      paymentId,
      { clearDealAmount: query.clearDealAmount },
    );
  }
}
