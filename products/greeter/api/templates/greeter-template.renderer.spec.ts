import { renderGreeterTemplate } from './greeter-template.renderer';

describe('renderGreeterTemplate', () => {
  it('renders allowlisted channel and user fields', () => {
    expect(
      renderGreeterTemplate('Hi {{user.firstName}} — {{channel.username}}', {
        user: { firstName: 'Ada', username: 'ada' },
        channel: { title: 'News', username: 'news' },
      }),
    ).toBe('Hi Ada — @news');
  });

  it('rejects unknown variables instead of silently producing broken copy', () => {
    expect(() =>
      renderGreeterTemplate('Hi {{user.username}} {{unknown.value}}', {
        user: { firstName: 'Ada' },
        channel: { title: 'News' },
      }),
    ).toThrow('Unsupported Greeter template variables: unknown.value');
  });
});
