import { normalizeInstagramProfile } from '@telegram-system/shared';
describe('Instagram contact syntax normalization only', () => {
  it.each([
    ['@Business.Example', 'business.example'],
    ['business_team', 'business_team'],
    ['  @Mixed.Case  ', 'mixed.case'],
    ['https://instagram.com/Business.Team', 'business.team'],
    [
      'https://www.instagram.com/Business.Team/?igsh=public-tracking#profile',
      'business.team',
    ],
    ['https://INSTAGRAM.COM/A1_/', 'a1_'],
    ['a'.repeat(30), 'a'.repeat(30)],
  ])(
    'canonicalizes %s without declaring ownership or profile existence',
    (raw, username) => {
      expect(normalizeInstagramProfile(raw)).toEqual({
        username,
        profileUrl: `https://www.instagram.com/${username}/`,
        originalValue: raw,
      });
    },
  );
  it.each([
    '',
    '   ',
    '@@profile',
    'name space',
    'https://instagram.com.evil.test/profile',
    'https://evil.test/instagram.com/profile',
    'javascript:alert(1)',
    'data:text/html,profile',
    'http://instagram.com/profile',
    'https://username:password@instagram.com/profile',
    'https://instagram.com:8443/profile',
    'https://instagram.com/p/abc',
    'https://instagram.com/reel/abc',
    'https://instagram.com/stories/profile/1',
    'https://instagram.com/direct/inbox',
    'https://instagram.com/profile/extra',
    'https://instagram.com/direct/../profile',
    'https://instagram.com/%2e%2e/profile',
    'https://instagram.com:443/profile',
    'https://instagram.com/%70rofile',
    'https://instagram.com/.profile',
    '.profile',
    'profile.',
    'double..dot',
    'a'.repeat(31),
    'профіль',
    'profile\nother',
    'profile\u0000',
    '@',
    'direct',
    'reels',
    'https://instagram.com/profile\\extra',
    'https://www.instagram.com//profile',
  ])('rejects unsafe or nonprofile input %p', (value) => {
    expect(() => normalizeInstagramProfile(value)).toThrow();
  });
  it('does not infer the same advertiser from similar profile names', () => {
    expect(normalizeInstagramProfile('@course.one').username).not.toBe(
      normalizeInstagramProfile('@course_one').username,
    );
    expect(normalizeInstagramProfile('@Course.One').username).toBe(
      normalizeInstagramProfile('https://instagram.com/course.one').username,
    );
  });
});
