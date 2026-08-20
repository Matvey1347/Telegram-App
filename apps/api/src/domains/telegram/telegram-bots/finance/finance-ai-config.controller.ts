import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, type JwtUser } from '../../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/jwt-auth.guard';
import { FinanceAiConfigService } from './finance-ai-config.service';

class SaveFinanceAiConfigDto {
  @IsOptional() @IsString() @MinLength(20) apiKey?: string;
  @IsOptional() @IsString() model?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('telegram-bots')
export class FinanceAiConfigController {
  constructor(private readonly configs: FinanceAiConfigService) {}
  @Get(':botId/finance/ai-config') resolved(@CurrentUser() user: JwtUser, @Param('botId') botId: string) { return this.configs.resolved(user.sub, botId); }
  @Patch('finance/ai-config') workspace(@CurrentUser() user: JwtUser, @Body() dto: SaveFinanceAiConfigDto) { return this.configs.save(user.sub, dto); }
  @Patch(':botId/finance/ai-config') bot(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Body() dto: SaveFinanceAiConfigDto) { return this.configs.save(user.sub, { ...dto, botIntegrationId: botId }); }
  @Delete(':botId/finance/ai-config') useWorkspaceDefault(@CurrentUser() user: JwtUser, @Param('botId') botId: string) { return this.configs.useWorkspaceDefault(user.sub, botId); }
  @Post(':botId/finance/ai-config/validate') validate(@CurrentUser() user: JwtUser, @Param('botId') botId: string) { return this.configs.validate(user.sub, botId); }
  @Get('finance/ai-config') workspaceResolved(@CurrentUser() user: JwtUser) { return this.configs.workspaceResolved(user.sub); }
}
