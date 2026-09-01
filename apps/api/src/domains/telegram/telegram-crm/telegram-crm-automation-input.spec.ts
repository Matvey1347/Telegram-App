import { validateCrmAutomationTypeOverrides } from './telegram-crm-automation-input';

describe('CRM automation input validation', () => {
  it('accepts only known machine type/override pairs', () => {
    expect(
      validateCrmAutomationTypeOverrides({ FOLLOW_UP: 'DISABLED' }),
    ).toEqual({ FOLLOW_UP: 'DISABLED' });
  });

  it.each([{ UNKNOWN: 'ENABLED' }, { FOLLOW_UP: 'YES' }])(
    'fails closed for malformed overrides %#',
    (value) => {
      expect(() => validateCrmAutomationTypeOverrides(value)).toThrow(
        'Invalid automation type override',
      );
    },
  );

  it('rejects non-object override containers', () => {
    expect(() => validateCrmAutomationTypeOverrides([])).toThrow(
      'Automation type overrides must be an object',
    );
  });
});
