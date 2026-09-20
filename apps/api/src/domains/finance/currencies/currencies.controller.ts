import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { UpdateCurrencySettingsDto } from './dto';
import { CurrenciesService } from './currencies.service';

@UseGuards(JwtAuthGuard)
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly service: CurrenciesService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: JwtUser) {
    return this.service.getSettings(user.sub);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateCurrencySettingsDto,
  ) {
    return this.service.updateSettings(user.sub, dto);
  }

  @Get('rates')
  getRates(@CurrentUser() user: JwtUser) {
    return this.service.getRates(user.sub);
  }

  @Get('rates/latest')
  getLatestRates(@CurrentUser() user: JwtUser) {
    return this.service.getLatestRates(user.sub);
  }

}
