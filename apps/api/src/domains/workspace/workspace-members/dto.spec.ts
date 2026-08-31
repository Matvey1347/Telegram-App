import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWorkspaceMemberDto } from './dto';

describe('CreateWorkspaceMemberDto', () => {
  const validatePassword = (password?: string) =>
    validate(
      plainToInstance(CreateWorkspaceMemberDto, {
        email: 'new@example.com',
        password,
      }),
    );

  it.each(['', '   '])(
    'treats a blank optional password (%p) as omitted',
    async (password) => {
      await expect(validatePassword(password)).resolves.toHaveLength(0);
    },
  );

  it('rejects a provided password shorter than eight characters', async () => {
    const errors = await validatePassword('short');

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'password',
          constraints: expect.objectContaining({
            minLength: expect.any(String),
          }),
        }),
      ]),
    );
  });

  it('accepts a provided password with eight characters', async () => {
    await expect(validatePassword('12345678')).resolves.toHaveLength(0);
  });
});
