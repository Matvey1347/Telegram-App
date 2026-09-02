import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateLocaleDto, UpdateMeDto } from './dto';

describe('UpdateMeDto locale preference', () => {
  it.each(['en', 'ru'])('accepts supported locale %s', (locale) => {
    expect(validateSync(plainToInstance(UpdateMeDto, { locale }))).toEqual([]);
  });

  it('rejects unsupported locale before persistence', () => {
    const errors = validateSync(
      plainToInstance(UpdateMeDto, { locale: 'de' }),
    );
    expect(errors[0]?.property).toBe('locale');
  });

  it('requires a supported locale on the narrow preference endpoint', () => {
    expect(validateSync(plainToInstance(UpdateLocaleDto, {}))[0]?.property).toBe(
      'locale',
    );
    expect(
      validateSync(plainToInstance(UpdateLocaleDto, { locale: 'ru' })),
    ).toEqual([]);
  });
});
