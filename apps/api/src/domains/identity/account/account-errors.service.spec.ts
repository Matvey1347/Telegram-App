import { HttpException } from '@nestjs/common';
import { AccountService } from './account.service';

describe('AccountService structured errors', () => {
  it('returns a stable code when a profile name becomes empty', async () => {
    const service = new AccountService(
      {} as never,
      {
        resolveWorkspaceMembershipForUser: jest.fn().mockResolvedValue({
          id: 'member-1',
          workspaceId: 'workspace-1',
        }),
      } as never,
      {} as never,
    );

    const error: unknown = await service
      .updateMe('user-1', { name: '   ' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toEqual({
      code: 'ACCOUNT_NAME_EMPTY',
      message: 'Name cannot be empty',
    });
  });
});
