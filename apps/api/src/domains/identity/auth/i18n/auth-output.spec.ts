import { translateAuthOutput } from './auth-output';

describe('auth backend output', () => {
  it('localizes generated workspace names', () => {
    expect(translateAuthOutput('ru', 'workspaceName', { name: 'Ольга' })).toBe(
      'Рабочее пространство Ольга',
    );
    expect(translateAuthOutput('en', 'workspaceName', { name: 'Alex' })).toBe(
      "Alex's Workspace",
    );
  });
});
