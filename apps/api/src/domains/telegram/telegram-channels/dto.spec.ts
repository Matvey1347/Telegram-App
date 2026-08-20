import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateTelegramManagedPostDto,
  UpdateTelegramManagedPostDto,
} from './dto';

const buttonRows = [[{
  text: 'Open',
  url: 'https://example.com',
  style: 'primary',
}]];

describe('managed post button DTOs', () => {
  it.each([CreateTelegramManagedPostDto, UpdateTelegramManagedPostDto])(
    'accepts array-based inline button rows for %p',
    (Dto) => {
      const dto = plainToInstance(Dto, { title: 'Post', buttonRows });

      expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }))
        .toEqual([]);
    },
  );
});
