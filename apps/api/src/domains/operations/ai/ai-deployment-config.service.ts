import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Internal AI configuration only; consumer Finance credentials/flags are separate. */
@Injectable()
export class AiDeploymentConfig {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly usageSource: 'PRODUCTION' | 'LOCAL_UNSYNCED';
  private readonly apiKey: string | undefined;
  constructor(config: ConfigService) {
    this.enabled = config.get<string>('INTERNAL_AI_ENABLED') === 'true';
    const runtimeEnvironment =
      config.get<string>('NODE_ENV')?.trim().toLowerCase() ?? '';
    const railwayEnvironment =
      config.get<string>('RAILWAY_ENVIRONMENT_NAME')?.trim().toLowerCase() ?? '';
    this.usageSource =
      runtimeEnvironment === 'production' || railwayEnvironment === 'production'
        ? 'PRODUCTION'
        : 'LOCAL_UNSYNCED';
    this.apiKey =
      config.get<string>('INTERNAL_AI_OPENAI_API_KEY')?.trim() || undefined;
    this.configured = Boolean(this.apiKey);
  }
  key() {
    return this.apiKey;
  }
}
