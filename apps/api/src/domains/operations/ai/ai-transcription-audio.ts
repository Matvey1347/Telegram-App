/** Validate a canonical, mono PCM16 WAV, with duration derived from bytes. */
export function aiTranscriptionWavSeconds(bytes: Buffer): number | null {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 46 ||
    bytes.length > 6 * 1024 * 1024
  )
    return null;
  if (
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE' ||
    bytes.readUInt32LE(4) !== bytes.length - 8
  )
    return null;
  let offset = 12;
  let sampleRate = 0;
  let dataSize = -1;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (size > bytes.length - start) return null;
    if (id === 'fmt ') {
      if (
        sampleRate ||
        size !== 16 ||
        bytes.readUInt16LE(start) !== 1 ||
        bytes.readUInt16LE(start + 2) !== 1 ||
        bytes.readUInt16LE(start + 14) !== 16
      )
        return null;
      sampleRate = bytes.readUInt32LE(start + 4);
      if (
        sampleRate < 16000 ||
        sampleRate > 48000 ||
        bytes.readUInt32LE(start + 8) !== sampleRate * 2 ||
        bytes.readUInt16LE(start + 12) !== 2
      )
        return null;
    } else if (id === 'data') {
      if (dataSize !== -1 || size % 2) return null;
      dataSize = size;
    } else return null;
    offset = start + size + (size % 2);
  }
  if (offset !== bytes.length || !sampleRate || dataSize <= 0) return null;
  const seconds = dataSize / (sampleRate * 2);
  return seconds > 0 && seconds <= 60 ? seconds : null;
}
