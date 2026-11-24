import { postingImageSearchPayload, readPostingImageSearch } from './ai-posting-image-search';

describe('OpenAI posting image search', () => {
  it('uses one image search with the requested domain', () => {
    expect(postingImageSearchPayload('model', 'an English search phrase', 'pinterest.com')).toMatchObject({
      max_tool_calls: 1,
      include: ['web_search_call.results'],
      tools: [{ type: 'web_search', search_content_types: ['image'], filters: { allowed_domains: ['pinterest.com'] } }],
    });
  });

  it('reads tool results only and keeps valid, distinct Pinterest files', () => {
    const candidate = (image: string, source: string) => ({ type: 'image_result', image_url: image, source_website_url: source });
    const file = 'https://i.pinimg.com/originals/photo.jpg';
    const pin = 'https://www.pinterest.com/pin/1234/';
    expect(readPostingImageSearch([
      { type: 'message', content: [{ type: 'output_text', text: 'https://example.org/invented.jpg' }] },
      { type: 'web_search_call', status: 'completed', results: [
        candidate(file, pin), candidate(file, pin),
        candidate('https://elsewhere.example/photo.jpg', pin),
        candidate(file, 'https://notpinterest.com/pin/1234/'),
        candidate(file, 'https://www.pinterest.com/ideas/'),
      ] },
    ], 'pinterest.com')).toEqual({
      calls: 1, completed: true,
      images: [{ url: file, sourceId: 'pinterest', sourceType: 'image-search' }],
    });
  });
});
