import { AiDeploymentConfig } from './ai-deployment-config.service';

function deploymentConfig(values: Record<string, string | undefined>) {
  return new AiDeploymentConfig({
    get: (key: string) => values[key],
  } as never);
}

describe('AI deployment usage source', () => {
  it('marks Railway production usage as production without NODE_ENV', () => {
    expect(
      deploymentConfig({ RAILWAY_ENVIRONMENT_NAME: 'production' }).usageSource,
    ).toBe('PRODUCTION');
  });

  it('marks explicit Node production usage as production', () => {
    expect(deploymentConfig({ NODE_ENV: 'production' }).usageSource).toBe(
      'PRODUCTION',
    );
  });

  it('marks local and preview usage as unsynced', () => {
    expect(deploymentConfig({ NODE_ENV: 'development' }).usageSource).toBe(
      'LOCAL_UNSYNCED',
    );
    expect(
      deploymentConfig({ RAILWAY_ENVIRONMENT_NAME: 'staging' }).usageSource,
    ).toBe('LOCAL_UNSYNCED');
  });
});
