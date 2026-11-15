import { TelegramAiPostingContentModelService } from './telegram-ai-posting-content-model.service';

describe('TelegramAiPostingContentModelService', () => {
  it('ignores an untouched empty rubric draft when saving the rest of the settings', async () => {
    const tx = {
      telegramAiPostingIdea: { upsert: jest.fn() },
      telegramAiPostingRubric: { deleteMany: jest.fn(), create: jest.fn() },
      telegramAiPostingSphere: { deleteMany: jest.fn(), createMany: jest.fn() },
      telegramAiPostingLength: { deleteMany: jest.fn(), createMany: jest.fn() },
    } as any;

    await expect(new TelegramAiPostingContentModelService().replace(
      tx,
      'workspace',
      'channel',
      { rubrics: [{ id: 'draft-id', name: '', description: '', goal: '', sphereId: null }] },
    )).resolves.toBeUndefined();

    expect(tx.telegramAiPostingRubric.create).not.toHaveBeenCalled();
    expect(tx.telegramAiPostingRubric.deleteMany).toHaveBeenCalled();
  });

  it('still rejects a partially entered rubric without an ID', async () => {
    const tx = {} as any;
    await expect(new TelegramAiPostingContentModelService().replace(
      tx,
      'workspace',
      'channel',
      { rubrics: [{ name: 'Useful rubric' }] },
    )).rejects.toThrow('AI_POSTING_RUBRIC_INVALID');
  });
});
