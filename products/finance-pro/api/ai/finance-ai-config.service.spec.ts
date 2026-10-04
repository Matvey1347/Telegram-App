import { FinanceAiConfigService } from './finance-ai-config.service';

describe('FinanceAiConfigService global provider credential', () => {
  function setup(existing: Record<string, unknown> | null = null) {
    const row = { id: 'config-1', apiKeyEncrypted: existing ? 'encrypted' : null, apiKeyIv: 'iv', apiKeyAuthTag: 'tag', connectionStatus: 'NOT_CONFIGURED', lastCheckedAt: null, lastValidationError: null, ...(existing || {}) };
    const prisma = { aiProviderConfig: { findFirst: jest.fn().mockResolvedValue(existing ? row : null), update: jest.fn().mockImplementation(async ({ data }) => ({ ...row, ...data })), create: jest.fn().mockImplementation(async ({ data }) => ({ ...row, ...data })) } };
    const workspace = { requireWorkspaceRole: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }) };
    const encryption = { encrypt: jest.fn().mockReturnValue({ encrypted: 'encrypted', iv: 'iv', authTag: 'tag' }), decrypt: jest.fn().mockReturnValue('saved-key') };
    return { service: new FinanceAiConfigService(prisma as never, workspace as never, encryption as never), prisma };
  }

  it('stores one workspace key without a model choice', async () => {
    const { service, prisma } = setup();
    await service.save('owner-1', { apiKey: 'sk-project-key-long-enough' });
    expect(prisma.aiProviderConfig.create).toHaveBeenCalledWith({ data: expect.not.objectContaining({ model: expect.anything() }) });
  });

  it('validates the global key against the runtime policy model', async () => {
    const { service } = setup({ apiKeyEncrypted: 'encrypted' });
    const previous = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;
    await expect(service.validateWorkspace('owner-1')).resolves.toMatchObject({ status: 'CONNECTED' });
    expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/models/gpt-5-mini', expect.anything());
    global.fetch = previous;
  });
});
