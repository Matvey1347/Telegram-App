import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Internal AI configuration only; consumer Finance credentials/flags are separate. */
@Injectable()
export class AiDeploymentConfig {
  readonly enabled: boolean;
  readonly configured: boolean;
  private readonly apiKey: string | undefined;
  constructor(config: ConfigService) {
    this.enabled = config.get<string>('INTERNAL_AI_ENABLED') === 'true';
    this.apiKey =
      config.get<string>('INTERNAL_AI_OPENAI_API_KEY')?.trim() || undefined;
    this.configured = Boolean(this.apiKey);
  }
  key() {
    return this.apiKey;
  }
}
