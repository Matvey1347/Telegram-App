import { Module } from '@nestjs/common';
import { AiDeploymentConfig } from './ai-deployment-config.service';
import { AiModelRegistry } from './ai-model-registry';
import { AiLocalConcurrency } from './ai-local-concurrency';
import { AiProvider } from './ai-provider';
import { AiAdmissionService } from './ai-admission.service';
import { AiSettlementService } from './ai-settlement.service';
import { AiGateway } from './ai-gateway';
import { AiConfigurationService } from './ai-configuration.service';
import { AiUsageReadService } from './ai-usage-read.service';
import { AiUsageRetentionService } from './ai-usage-retention.service';
import { AiUsageController } from './ai-usage.controller';

@Module({
  controllers: [AiUsageController],
  providers: [
    AiDeploymentConfig,
    AiModelRegistry,
    AiLocalConcurrency,
    AiProvider,
    AiAdmissionService,
    AiSettlementService,
    AiGateway,
    AiConfigurationService,
    AiUsageReadService,
    AiUsageRetentionService,
  ],
  exports: [AiGateway, AiUsageRetentionService],
})
export class AiModule {}
