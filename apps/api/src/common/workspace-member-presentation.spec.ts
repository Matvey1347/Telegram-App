import { withWorkspaceMemberAvatar } from './workspace-member-presentation';

describe('withWorkspaceMemberAvatar', () => {
  it('adds resolved image avatar data to nested finance members', () => {
    expect(withWorkspaceMemberAvatar({
      id: 'member-1',
      avatarIcon: { id: 'icon-1', type: 'image', name: 'Avatar', imageUrl: 'https://cdn.example/avatar.jpg' },
    })).toMatchObject({
      id: 'member-1',
      avatarPresentation: { type: 'image', url: 'https://cdn.example/avatar.jpg' },
    });
  });

  it('preserves a missing member', () => {
    expect(withWorkspaceMemberAvatar(null)).toBeNull();
  });
});
