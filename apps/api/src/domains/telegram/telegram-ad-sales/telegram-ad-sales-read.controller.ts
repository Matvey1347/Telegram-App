import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  CreateTelegramAdQuoteDto,
  TelegramAdAvailabilityQueryDto,
  TelegramAdSalesQueryDto,
} from './dto';
import { TelegramAdQuotePreviewBatchRequestDto } from './telegram-ad-sales-quote-preview.dto';
import { TelegramAdSalesQuotePreviewService } from './telegram-ad-sales-quote-preview.service';
import { TelegramAdSalesSaleReadService } from './telegram-ad-sales-sale-read.service';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-ad-sales')
export class TelegramAdSalesReadController {
  constructor(
    private readonly service: TelegramAdSalesService,
    private readonly quotePreviewService: TelegramAdSalesQuotePreviewService,
    private readonly saleReadService: TelegramAdSalesSaleReadService,
  ) {}

  @Post('quotes')
  createQuote(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramAdQuoteDto,
  ) {
    return this.service.createQuote(user.sub, dto);
  }

  @Post('quotes/preview')
  previewQuotes(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdQuotePreviewBatchRequestDto,
  ) {
    return this.quotePreviewService.previewBatch(user.sub, dto);
  }

  @Post('availability')
  availability(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdAvailabilityQueryDto,
  ) {
    return this.service.availability(user.sub, dto);
  }

  @Get()
  listSales(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdSalesQueryDto,
  ) {
    return this.saleReadService.listSales(user.sub, query);
  }
}
