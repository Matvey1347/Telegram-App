import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AiCategory } from '@telegram-system/shared';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { AiConfigurationService } from './ai-configuration.service';
import { AiUsageReadService } from './ai-usage-read.service';
import { AiGateway } from './ai-gateway';
import {
  AiCategoryConfigurationDto,
  AiReconciliationDto,
  AiUsageQueryDto,
  AiOperationsQueryDto,
  AiWorkspaceConfigurationDto,
} from './ai-usage.dto';

/** Configuration/telemetry only: there is deliberately no public AI execution endpoint. */
@UseGuards(JwtAuthGuard)
@Controller('operations/ai')
export class AiUsageController {
  constructor(
    private readonly config: AiConfigurationService,
    private readonly reads: AiUsageReadService,
    private readonly gateway: AiGateway,
  ) {}
  @Get('config') configuration(@CurrentUser() user: JwtUser) {
    return this.config.get(user.sub);
  }
  @Patch('config') update(
    @CurrentUser() user: JwtUser,
    @Body() input: AiWorkspaceConfigurationDto,
  ) {
    return this.config.patchWorkspace(user.sub, input);
  }
  @Patch('categories/:category') category(
    @CurrentUser() user: JwtUser,
    @Param('category') category: AiCategory,
    @Body() input: AiCategoryConfigurationDto,
  ) {
    return this.config.patchCategory(user.sub, category, input);
  }
  @Get('usage') dashboard(
    @CurrentUser() user: JwtUser,
    @Query() query: AiUsageQueryDto,
  ) {
    return this.reads.dashboard(user.sub, query);
  }
  @Get('operations') operations(
    @CurrentUser() user: JwtUser,
    @Query() query: AiOperationsQueryDto,
  ) {
    return this.reads.operations(user.sub, query);
  }
  @Post('operations/:id/reconcile') reconcile(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: AiReconciliationDto,
  ) {
    return this.gateway.reconcile(user.sub, id, input);
  }
}
