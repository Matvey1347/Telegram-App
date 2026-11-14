import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TelegramAiPostingChatSourcesService } from './telegram-ai-posting-chat-sources.service';

describe('AI Posting chat company sources', () => {
  const channel = { findFirst: jest.fn() };
  const membership = { require: jest.fn(), refresh: jest.fn() };
  const source = { checkWebSource: jest.fn(), discoverNewsPages: jest.fn() };
  const structure = { resolveForDraft: jest.fn() };
  const tx = {
    $executeRaw: jest.fn(),
    telegramAiPostingSettings: { findFirst: jest.fn(), updateMany: jest.fn() },
    telegramContentHypothesis: { findFirst: jest.fn(), updateMany: jest.fn() },
    telegramAiPostingSettingsVersion: { create: jest.fn() },
  };
  const prisma = { telegramChannel: channel, $transaction: jest.fn((fn) => fn(tx)) };
  const service = new TelegramAiPostingChatSourcesService(prisma as never, membership as never, source as never, structure as never);
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();
  const result = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch;
    membership.require.mockResolvedValue({ workspaceId: 'ws-a', memberId: 'member-a' });
    channel.findFirst.mockResolvedValue({ id: 'channel-a' });
    source.checkWebSource.mockResolvedValue({ ok: true });
    source.discoverNewsPages.mockResolvedValue([]);
    tx.telegramAiPostingSettings.findFirst.mockResolvedValue({ id: 'settings-a', configurationVersion: 2, configuration: { sources: [], categories: [], formats: [], imageMode: 'hybrid' } });
    tx.telegramAiPostingSettings.updateMany.mockResolvedValue({ count: 1 });
    tx.telegramContentHypothesis.findFirst.mockResolvedValue(null);
    tx.telegramContentHypothesis.updateMany.mockResolvedValue({ count: 1 });
    structure.resolveForDraft.mockResolvedValue({ hypothesisId: 'hypothesis-a' });
    tx.telegramAiPostingSettingsVersion.create.mockResolvedValue({ id: 'version-a' });
    mockFetch.mockResolvedValueOnce(result({ search: [{ id: 'Q123', label: 'Company', description: 'Business' }] })).mockResolvedValueOnce(result({ entities: { Q123: { claims: { P856: [{ mainsnak: { datavalue: { value: 'https://company.example/?tracking=secret#section' } } }] } } } }));
  });
  afterAll(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });
  it('discovers a real verified official site and removes URL parameters', async () => {
    const found = await service.discover('user-a', 'channel-a', 'Company');
    expect(found.candidates).toEqual([{ entityId: 'Q123', name: 'Company', description: 'Business', website: 'https://company.example/' }]);
    expect(source.checkWebSource).toHaveBeenCalledWith('website', 'https://company.example/');
    expect(channel.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'channel-a', workspaceId: 'ws-a' } }));
  });
  it('adds the verified source and hypothesis to the same scoped configuration version', async () => {
    const applied = await service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Company stories', description: 'Short cases' });
    expect(applied).toMatchObject({ source: { type: 'website', value: 'https://company.example/', added: true }, rubric: { id: 'hypothesis-a', name: 'Company stories', added: true }, settingsVersion: 3 });
    expect(tx.telegramAiPostingSettings.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'settings-a', workspaceId: 'ws-a', configurationVersion: 2 }, data: expect.objectContaining({ configuration: expect.objectContaining({ categories: ['Company stories'], sources: [expect.objectContaining({ value: 'https://company.example/', useImages: false })] }) }) }));
    expect(tx.telegramAiPostingSettingsVersion.create).toHaveBeenCalled();
  });
  it('places the new source first and keeps unrelated sources', async () => {
    tx.telegramAiPostingSettings.findFirst.mockResolvedValue({ id: 'settings-a', configurationVersion: 2, configuration: { sources: [{ id: 'previous', type: 'website', value: 'https://other.example/', enabled: true }], categories: [], formats: [] } });
    await service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' });
    const data = tx.telegramAiPostingSettings.updateMany.mock.calls[0][0].data.configuration;
    expect(data.sources.map((item: { value: string }) => item.value)).toEqual(['https://company.example/', 'https://other.example/']);
  });
  it('moves a previously disabled source to the front and enables it', async () => {
    tx.telegramAiPostingSettings.findFirst.mockResolvedValue({ id: 'settings-a', configurationVersion: 2, configuration: { sources: [{ id: 'previous', type: 'website', value: 'https://other.example/', enabled: true }, { id: 'source-existing', type: 'website', value: 'https://company.example/', enabled: false }], categories: [], formats: [] } });
    const applied = await service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' });
    const data = tx.telegramAiPostingSettings.updateMany.mock.calls[0][0].data.configuration;
    expect(data.sources).toEqual([expect.objectContaining({ id: 'source-existing', enabled: true }), expect.objectContaining({ id: 'previous' })]);
    expect(applied.source).toMatchObject({ added: false, reEnabled: true });
  });
  it('adds the verified news page first and marks it for bounded article collection', async () => {
    source.discoverNewsPages.mockResolvedValue(['https://company.example/news']);
    const result = await service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' });
    const data = tx.telegramAiPostingSettings.updateMany.mock.calls[0][0].data.configuration;
    expect(source.discoverNewsPages).toHaveBeenCalledWith('https://company.example/');
    expect(data.sources).toEqual([expect.objectContaining({ value: 'https://company.example/news', enabled: true, useImages: false, followNewsArticles: true }), expect.objectContaining({ value: 'https://company.example/', useImages: false })]);
    expect(result.newsSource).toMatchObject({ value: 'https://company.example/news', added: true });
  });
  it('does not add offsite or credential-bearing news links', async () => {
    source.discoverNewsPages.mockResolvedValue(['https://other.example/news', 'https://secret@company.example/news']);
    const result = await service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' });
    expect(result.newsSource).toBeNull();
  });
  it('continues with the official site when news discovery fails', async () => {
    source.discoverNewsPages.mockRejectedValue(new Error('unavailable'));
    const result = await service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' });
    expect(result.newsSource).toBeNull();
    expect(result.source.value).toBe('https://company.example/');
  });
  it('reuses an existing news page without a needless settings write', async () => {
    source.discoverNewsPages.mockResolvedValue(['https://company.example/news']);
    tx.telegramAiPostingSettings.findFirst.mockResolvedValue({ id: 'settings-a', configurationVersion: 8, configuration: { sources: [{ id: 'news', type: 'website', value: 'https://company.example/news', enabled: true, followNewsArticles: true }, { id: 'home', type: 'website', value: 'https://company.example/', enabled: true }], categories: ['Cases'], formats: [] } });
    tx.telegramContentHypothesis.findFirst.mockResolvedValue({ id: 'hypothesis-a', name: 'Cases' });
    const result = await service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' });
    expect(result.newsSource).toMatchObject({ id: 'news', added: false });
    expect(tx.telegramAiPostingSettings.updateMany).not.toHaveBeenCalled();
  });
  it('requires the AI execution permission before searching', async () => {
    membership.require.mockRejectedValue(new Error('forbidden'));
    await expect(service.discover('user-a', 'channel-a', 'Company')).rejects.toThrow('forbidden');
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('reuses an existing source and hypothesis without changing the settings version', async () => {
    tx.telegramAiPostingSettings.findFirst.mockResolvedValue({ id: 'settings-a', configurationVersion: 8, configuration: { sources: [{ id: 'source-existing', type: 'website', value: 'https://company.example', enabled: true }], categories: ['Company stories'], formats: [] } });
    tx.telegramContentHypothesis.findFirst.mockResolvedValue({ id: 'hypothesis-a', name: 'Company stories' });
    const applied = await service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Company stories' });
    expect(applied).toMatchObject({ source: { id: 'source-existing', added: false }, rubric: { id: 'hypothesis-a', added: false }, settingsVersion: 8 });
    expect(tx.telegramAiPostingSettings.updateMany).not.toHaveBeenCalled();
    expect(tx.telegramAiPostingSettingsVersion.create).not.toHaveBeenCalled();
  });
  it('asks to choose when multiple verified company sites match', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(result({ search: [{ id: 'Q123', label: 'Company A' }, { id: 'Q456', label: 'Company B' }] })).mockResolvedValueOnce(result({ entities: { Q123: { claims: { P856: [{ mainsnak: { datavalue: { value: 'https://a.example/' } } }] } }, Q456: { claims: { P856: [{ mainsnak: { datavalue: { value: 'https://b.example/' } } }] } } } }));
    try {
      await service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' });
      throw new Error('expected ambiguity');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ message: 'AI_POSTING_COMPANY_AMBIGUOUS', candidates: [expect.objectContaining({ entityId: 'Q123', website: 'https://a.example/' }), expect.objectContaining({ entityId: 'Q456', website: 'https://b.example/' })] });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rechecks permissions after external discovery and before writing', async () => {
    membership.refresh.mockRejectedValueOnce(new Error('membership revoked'));
    await expect(service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' })).rejects.toThrow('membership revoked');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects inaccessible channels before making any outside request', async () => {
    channel.findFirst.mockResolvedValue(null);
    await expect(service.discover('user-a', 'other-channel', 'Company')).rejects.toBeInstanceOf(NotFoundException);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('does not add an unreachable site', async () => {
    source.checkWebSource.mockResolvedValue({ ok: false });
    await expect(service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('aborts an outdated configuration update instead of overwriting concurrent edits', async () => {
    tx.telegramAiPostingSettings.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.setup('user-a', 'channel-a', { query: 'Company', rubric: 'Cases' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.telegramAiPostingSettingsVersion.create).not.toHaveBeenCalled();
  });
  it('reports search provider failure instead of inventing a result', async () => {
    mockFetch.mockReset(); mockFetch.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.discover('user-a', 'channel-a', 'Company')).rejects.toBeInstanceOf(BadGatewayException);
  });
  it('rejects private-looking queries before sending them to the search provider', async () => {
    await expect(service.discover('user-a', 'channel-a', 'person@example.com')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.discover('user-a', 'channel-a', '+380 (67) 123-45-67')).rejects.toBeInstanceOf(BadRequestException);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
