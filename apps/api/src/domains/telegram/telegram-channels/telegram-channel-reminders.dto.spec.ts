import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChannelReminderTemplateDto } from './telegram-channel-reminders.dto';

describe('ChannelReminderTemplateDto', () => {
  it('accepts an optional iconId under the API whitelist validation', () => {
    const dto = plainToInstance(ChannelReminderTemplateDto, {
      name: 'Daily reminders',
      iconId: 'workspace-icon',
      daysBefore: [3, 2, 1],
      notifyEmpty: true,
    });

    expect(
      validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toEqual([]);
  });
});
