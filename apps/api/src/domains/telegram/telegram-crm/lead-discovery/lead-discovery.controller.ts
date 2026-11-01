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
import {
  CurrentUser,
  type JwtUser,
} from '../../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/jwt-auth.guard';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadSourceService } from './lead-source.service';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadTransportService } from './lead-transport.service';
import { TelegramLeadIngestService } from './lead-ingest.service';
import { TelegramLeadAnalysisService } from './lead-analysis.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import { TelegramLeadExportService } from './lead-export.service';
import {
  LeadExportDto,
  LeadImportDto,
  LeadImportPreviewDto,
  LeadPageDto,
  LeadScanDto,
  LeadSourceInputDto,
  LeadSourcePatchDto,
} from './lead-source.dto';
import {
  LeadAnalyzeDto,
  LeadBulkReviewDto,
  LeadCandidateReviewDto,
  LeadFeedDto,
  LeadManualCandidateDto,
  LeadMaterialsDto,
  LeadReviewObservationDto,
} from './lead-material.dto';
@UseGuards(JwtAuthGuard)
@Controller('telegram-crm/lead-discovery')
export class TelegramLeadDiscoveryController {
  constructor(
    private readonly policy: TelegramLeadPolicy,
    private readonly sources: TelegramLeadSourceService,
    private readonly read: TelegramLeadReadService,
    private readonly transport: TelegramLeadTransportService,
    private readonly ingest: TelegramLeadIngestService,
    private readonly analysis: TelegramLeadAnalysisService,
    private readonly candidates: TelegramLeadCandidateService,
    private readonly exporter: TelegramLeadExportService,
  ) {}
  @Get('config') config(@CurrentUser() user: JwtUser) {
    return this.policy.configuration(user.sub);
  }
  @Get('accounts') accounts(@CurrentUser() user: JwtUser) {
    return this.transport.accounts(user.sub);
  }
  @Get('accounts/:id/channels') channels(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() input: LeadPageDto,
  ) {
    return this.transport.channels(user.sub, id, input);
  }
  @Get('sources/export') export(
    @CurrentUser() user: JwtUser,
    @Query() input: LeadExportDto,
  ) {
    return this.exporter.export(user.sub, input.format);
  }
  @Get('sources') list(
    @CurrentUser() user: JwtUser,
    @Query() input: LeadPageDto,
  ) {
    return this.read.sources(user.sub, input);
  }
  @Post('sources') create(
    @CurrentUser() user: JwtUser,
    @Body() input: LeadSourceInputDto,
  ) {
    return this.sources.create(user.sub, input);
  }
  @Patch('sources/:id') patch(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadSourcePatchDto,
  ) {
    return this.sources.patch(user.sub, id, input);
  }
  @Post('sources/import/preview') preview(
    @CurrentUser() user: JwtUser,
    @Body() input: LeadImportPreviewDto,
  ) {
    return this.sources.preview(user.sub, input.text, input.format);
  }
  @Post('sources/import') import(
    @CurrentUser() user: JwtUser,
    @Body() input: LeadImportDto,
  ) {
    return this.sources.import(user.sub, input.items);
  }
  @Post('sources/:id/validate') validate(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.transport.validate(user.sub, id);
  }
  @Post('sources/:id/scan') scan(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadScanDto,
  ) {
    return this.transport.scan(user.sub, id, input);
  }
  @Post('sources/:id/recover') recover(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.transport.recover(user.sub, id);
  }
  @Post('sources/:id/materials') materials(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadMaterialsDto,
  ) {
    return this.ingest.ingest(user.sub, id, input.items);
  }
  @Get('feed') feed(@CurrentUser() user: JwtUser, @Query() input: LeadFeedDto) {
    return this.read.feed(user.sub, input);
  }
  @Post('analyze') analyze(
    @CurrentUser() user: JwtUser,
    @Body() input: LeadAnalyzeDto,
  ) {
    return this.analysis.analyze(user.sub, input.observationIds);
  }
  @Patch('observations/:id/review') reviewObservation(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadReviewObservationDto,
  ) {
    return this.candidates.reviewObservation(user.sub, id, input.reviewStatus);
  }
  @Post('observations/:id/candidate') candidate(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadManualCandidateDto,
  ) {
    return this.candidates.fromMaterial(user.sub, id, input);
  }
  @Get('candidates') candidatesList(
    @CurrentUser() user: JwtUser,
    @Query() input: LeadFeedDto,
  ) {
    return this.read.candidates(user.sub, input);
  }
  @Get('candidates/:id') details(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.read.candidate(user.sub, id);
  }
  @Patch('candidates/:id/review') review(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadCandidateReviewDto,
  ) {
    return this.candidates.review(user.sub, id, input);
  }
  @Post('candidates/review') bulk(
    @CurrentUser() user: JwtUser,
    @Body() input: LeadBulkReviewDto,
  ) {
    return this.candidates.bulkReview(user.sub, input.ids, input.action);
  }
}
