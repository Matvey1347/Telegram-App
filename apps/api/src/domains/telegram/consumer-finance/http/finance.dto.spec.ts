import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateFinanceSettingsDto } from './finance.dto';

describe('Finance consumer DTO validation', () => {
  it.each(['uk', 'ru', 'en'])('accepts supported locale %s', async (locale) => {
    const dto = plainToInstance(UpdateFinanceSettingsDto, {
      defaultCurrency: 'USD',
      timezone: 'UTC',
      locale,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['uk-UA', 'pl', 'EN', ''])(
    'rejects unsupported locale %s',
    async (locale) => {
      const dto = plainToInstance(UpdateFinanceSettingsDto, {
        defaultCurrency: 'USD',
        timezone: 'UTC',
        locale,
      });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'locale')).toBe(true);
    },
  );
});
