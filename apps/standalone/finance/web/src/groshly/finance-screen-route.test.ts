import { describe, expect, it } from 'vitest';
import { normalizeFinanceScreen } from './finance-screen-route';

describe('legacy Finance bot links', () => {
  it.each([
    ['billing', 'subscription'],
    ['transactions', 'history'],
    ['regular-payments', 'recurring'],
    ['settings', 'financeSettings'],
    ['analytics', 'analytics'],
  ])('opens %s on the standalone Finance screen %s', (input, screen) => {
    expect(normalizeFinanceScreen(input)).toBe(screen);
  });
});
