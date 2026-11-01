/** Pure syntax normalization only; never proves profile existence or ownership. */
export function normalizeInstagramProfile(input: string): { username: string; profileUrl: string; originalValue: string } {
  if (typeof input !== 'string' || !input.trim() || input.length > 500 || /[\u0000-\u001f\u007f]/u.test(input)) throw new Error('INSTAGRAM_PROFILE_INVALID');
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    if (!/^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?(?:[?#].*)?$/i.test(value)) throw new Error('INSTAGRAM_PROFILE_INVALID');
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['instagram.com','www.instagram.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port || !/^\/[A-Za-z0-9._]{1,30}\/?$/.test(url.pathname)) throw new Error('INSTAGRAM_PROFILE_INVALID');
    value = url.pathname.split('/')[1];
  } else if (value.startsWith('@')) value = value.slice(1);
  if (!/^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/.test(value) || ['p','reel','reels','stories','direct','explore','accounts','about','legal','developer'].includes(value.toLowerCase())) throw new Error('INSTAGRAM_PROFILE_INVALID');
  const username = value.toLowerCase();
  return { username, profileUrl: `https://www.instagram.com/${username}/`, originalValue: input };
}
