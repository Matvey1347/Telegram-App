import {
  Body,
  ForbiddenException,
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
import { TelegramLeadHistoryJobService } from './lead-history-job.service';
import { TelegramLeadMetadataDiagnostics } from './lead-metadata-diagnostics.service';
import { TelegramLeadMediaPilotService } from './lead-media-pilot.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';
import {
  LeadExportDto,
  LeadImportDto,
  LeadImportPreviewDto,
  LeadPageDto,
  LeadScanDto,
  LeadMetadataDiagnosticsDto,
  LeadSourceInputDto,
  LeadSourcePatchDto,
} from './lead-source.dto';
import {
  LeadAnalyzeDto,
  LeadMediaPilotDto,
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
    private readonly historyJobs: TelegramLeadHistoryJobService,
    private readonly metadataDiagnostics: TelegramLeadMetadataDiagnostics,
    private readonly mediaPilot: TelegramLeadMediaPilotService,
    private readonly executor: TelegramLeadAnalysisExecutor,
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
  @Get('sources/:id/autopilot') historyStatus(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.historyJobs.status(user.sub, id);
  }
  @Get('sources/:id/metadata-diagnostics') metadataSummary(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() input: LeadMetadataDiagnosticsDto,
  ) {
    return this.metadataDiagnostics.sample(user.sub, id, input.beforeId);
  }
  @Get('sources/:id/media-pilot/photo-check/:observationId')
  checkMediaPilotPhoto(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('observationId') observationId: string,
  ) {
    return this.metadataDiagnostics.checkPhoto(user.sub, id, observationId);
  }
  @Post('sources/:id/autopilot/refresh-metadata') refreshMetadata(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadScanDto,
  ) {
    return this.metadataDiagnostics.refresh(user.sub, id, input);
  }
  @Post('sources/:id/media-pilot') runMediaPilot(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadMediaPilotDto,
  ) {
    return this.mediaPilot.run(user.sub, id, input.observationIds);
  }
  @Get('sources/:id/media-pilot') mediaPilotResults(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.mediaPilot.results(user.sub, id);
  }
  @Post('sources/:id/text-first/resolve') async resolveSelectedText(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadMediaPilotDto,
  ) {
    const source = await this.policy.source(user.sub, id, 'analyze');
    this.policy.assertProcessing(source, 'ingest', true);
    this.policy.assertProcessing(source, 'ai', true);
    if (source.monitoringActorUserId !== user.sub)
      throw new ForbiddenException('LEAD_AUTOMATION_ACTOR_MISMATCH');
    return this.executor.runSelected(
      {
        workspaceId: source.workspaceId,
        sourceId: source.id,
        userId: user.sub,
      },
      input.observationIds,
    );
  }
  @Get('sources/:id/autopilot/progress') pipelineProgress(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.historyJobs.progress(user.sub, id);
  }
  @Post('sources/:id/autopilot/start') startHistory(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.historyJobs.start(user.sub, id);
  }
  @Post('sources/:id/autopilot/pause') pauseHistory(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.historyJobs.pause(user.sub, id);
  }
  @Post('sources/:id/autopilot/resume') resumeHistory(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.historyJobs.resume(user.sub, id);
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
