import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { InvestmentsService } from './investments.service';

@UseGuards(JwtAuthGuard)
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly service: InvestmentsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: PaginationQueryDto) {
    return this.service.findAll(user.sub, query);
  }
}
