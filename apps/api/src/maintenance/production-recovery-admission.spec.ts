import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ProductionRecoveryAdmission } from './production-recovery-admission';

jest.mock('../config/production-recovery-config', () => ({
  productionRecoveryConfig: () => ({
    userId: 'named-owner',
    workspaceId: 'selected-workspace',
    capability: 'a'.repeat(64),
  }),
}));

describe('ProductionRecoveryAdmission', () => {
  function attempt(headers: Record<string, string>) {
    const request = { headers, user: { sub: 'untrusted-user' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
    new ProductionRecoveryAdmission().canActivate(context);
    return request.user;
  }

  it('uses the admitted owner from the gateway after checking the local capability', () => {
    expect(
      attempt({
        authorization: 'Bearer fixture-session',
        'x-workspace-id': 'selected-workspace',
        'x-local-operator-capability': 'a'.repeat(64),
      }),
    ).toEqual({ sub: 'named-owner' });
  });

  it.each(['', 'bad', 'b'.repeat(64)])(
    'rejects direct calls with capability %p',
    (capability) => {
      expect(() =>
        attempt({
          authorization: 'Bearer fixture-session',
          'x-workspace-id': 'selected-workspace',
          'x-local-operator-capability': capability,
        }),
      ).toThrow(ForbiddenException);
    },
  );

  it('rejects a different workspace even with the correct capability', () => {
    expect(() =>
      attempt({
        authorization: 'Bearer fixture-session',
        'x-workspace-id': 'other-workspace',
        'x-local-operator-capability': 'a'.repeat(64),
      }),
    ).toThrow(ForbiddenException);
  });
});
