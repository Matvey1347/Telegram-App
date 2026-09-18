import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('canonical System Bot website post import routing', () => {
  const directory = join(
    process.cwd(),
    'src/domains/telegram/telegram-system-bot',
  );
  const controller = readFileSync(
    join(directory, 'telegram-system-bot.controller.ts'),
    'utf8',
  );
  const handler = readFileSync(
    join(directory, 'telegram-system-bot-handler.service.ts'),
    'utf8',
  );

  it('exposes one mode-based import resource and one preview route', () => {
    expect(controller).toContain("@Post('post-imports')");
    expect(controller).toContain("@Get('post-imports/:workflowId')");
    expect(controller).toContain("@Delete('post-imports/:workflowId')");
    expect(controller).toContain("@Post('post-preview')");
  });

  it.each([
    'ad-sale-post-import',
    'promo-post-import',
    'mutual-promotion-post-import',
    'post-batch-import',
    'ad-sale-post-preview',
    'promo-post-preview',
    'mutual-promotion-post-preview',
  ])('does not retain the legacy %s route', (legacyRoute) => {
    expect(controller).not.toContain(legacyRoute);
  });

  it('routes callbacks and input through one website import service', () => {
    expect(handler).toContain('this.postImport.callback(');
    expect(handler).toContain('this.postImport?.input(');
    expect(handler).not.toContain('postBatchFlow');
    expect(handler).not.toContain('mutualPromotionPostFlow');
  });
});
