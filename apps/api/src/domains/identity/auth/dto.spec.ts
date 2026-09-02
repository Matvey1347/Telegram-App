import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './dto';

const validRegistration = {
  email: 'user@example.test',
  password: 'password',
  name: 'User',
};

describe('RegisterDto locale preference', () => {
  it.each(['en', 'ru'])('accepts supported locale %s', (locale) => {
    expect(
      validateSync(
        plainToInstance(RegisterDto, { ...validRegistration, locale }),
      ),
    ).toEqual([]);
  });

  it('rejects unsupported locale', () => {
    const errors = validateSync(
      plainToInstance(RegisterDto, { ...validRegistration, locale: 'de' }),
    );
    expect(errors.find((error) => error.property === 'locale')).toBeDefined();
  });
});
