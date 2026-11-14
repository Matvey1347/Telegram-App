import { aiTranscriptionWavSeconds } from './ai-transcription-audio';

function wav(seconds: number) {
  const rate = 16000,
    bytes = Buffer.alloc(44 + rate * 2 * seconds);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
it('derives duration from PCM bytes and rejects malformed or excessive audio', () => {
  expect(aiTranscriptionWavSeconds(wav(1))).toBe(1);
  expect(aiTranscriptionWavSeconds(wav(60))).toBe(60);
  expect(aiTranscriptionWavSeconds(wav(61))).toBeNull();
  const broken = wav(1);
  broken.writeUInt32LE(2, 40);
  expect(aiTranscriptionWavSeconds(broken)).toBeNull();
  expect(aiTranscriptionWavSeconds(Buffer.from('not audio'))).toBeNull();
});
