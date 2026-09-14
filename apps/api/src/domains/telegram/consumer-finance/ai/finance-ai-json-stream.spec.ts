import { partialJsonStringField } from './finance-ai-json-stream';

describe('partialJsonStringField', () => {
  it('returns decoded text while a structured response is still incomplete', () => {
    expect(
      partialJsonStringField(
        '{"kind":"ANSWER","message":"Hello\\nworld',
        'message',
      ),
    ).toBe('Hello\nworld');
  });

  it('waits for incomplete escapes and dangling unicode surrogates', () => {
    expect(partialJsonStringField('{"message":"Hi\\u', 'message')).toBe('Hi');
    expect(partialJsonStringField('{"message":"Hi \\uD83D', 'message')).toBe(
      'Hi ',
    );
    expect(
      partialJsonStringField(
        '{"message":"Hi \\uD83D\\uDE00","operations":[]}',
        'message',
      ),
    ).toBe('Hi 😀');
  });
});
