import { EventEmitter } from 'node:events';
import type { Request } from 'express';
import type { JwtUser } from '../../../common/current-user.decorator';
import { TelegramCrmCopilotController } from './telegram-crm-copilot.controller';
import { TelegramCrmCopilotService } from './telegram-crm-copilot.service';
import { TelegramCrmCopilotDraftsService } from './telegram-crm-copilot-drafts.service';
import { TelegramCrmCopilotContextService } from './telegram-crm-copilot-context.service';
import { CrmCopilotGenerateDto } from './telegram-crm-copilot.dto';

describe('CRM Copilot request cancellation', () => {
  describe.each(['generate', 'suggest'] as const)('%s request', (method) => {
    it.each(['aborted', 'close'])(
      'propagates %s and removes listeners without a timer',
      async (event) => {
        let signal: AbortSignal | undefined;
        let finish: (() => void) | undefined;
        const generate = jest.fn(
          (
            _user: string,
            _conversation: string,
            _input: CrmCopilotGenerateDto,
            cancellation: AbortSignal,
          ) => {
            signal = cancellation;
            return new Promise<void>((resolve) => {
              finish = resolve;
            });
          },
        );
        const controller = new TelegramCrmCopilotController(
          { [method]: generate } as unknown as TelegramCrmCopilotService,
          {} as TelegramCrmCopilotDraftsService,
          {} as TelegramCrmCopilotContextService,
        );
        const response = Object.assign(new EventEmitter(), {
          writableEnded: false,
        });
        const request = Object.assign(new EventEmitter(), {
          aborted: false,
          res: response,
        });
        const pending = controller[method](
          { sub: 'user' } as JwtUser,
          'conversation',
          {} as CrmCopilotGenerateDto,
          request as unknown as Request,
        );
        expect(signal?.aborted).toBe(false);
        (event === 'close' ? response : request).emit(event);
        expect(signal?.aborted).toBe(true);
        finish?.();
        await pending;
        expect(request.listenerCount('aborted')).toBe(0);
        expect(response.listenerCount('close')).toBe(0);
      },
    );
  });
});
