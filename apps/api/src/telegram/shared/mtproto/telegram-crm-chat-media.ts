import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { crmSafeFileName } from './telegram-crm-message-metadata';

export const CRM_CHAT_MEDIA_LIMIT = 10 * 1024 * 1024;
const FILE_MIMES = new Set([
  'application/pdf',
  'application/zip',
  'application/octet-stream',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'video/mp4',
]);

/** Validate every Ogg page boundary and the Opus identification header; no transcoding. */
export function crmVoiceDuration(data: Buffer) {
  let offset = 0;
  let lastGranule = 0n;
  let preSkip = 0;
  let serial: number | undefined;
  let sequence = 0;
  let tags = false;
  let ended = false;
  while (offset < data.length) {
    if (
      offset + 27 > data.length ||
      data.toString('ascii', offset, offset + 4) !== 'OggS' ||
      data[offset + 4] !== 0
    )
      throw new BadRequestException('VOICE_REQUIRES_OGG_OPUS');
    const segments = data[offset + 26];
    const headerEnd = offset + 27 + segments;
    if (headerEnd > data.length)
      throw new BadRequestException('INVALID_OGG_PAGE');
    let payloadLength = 0;
    for (let i = offset + 27; i < headerEnd; i++) payloadLength += data[i];
    if (headerEnd + payloadLength > data.length)
      throw new BadRequestException('INVALID_OGG_PAGE');
    const pageSerial = data.readUInt32LE(offset + 14);
    if (
      data.readUInt32LE(offset + 18) !== sequence++ ||
      (serial !== undefined && serial !== pageSerial)
    )
      throw new BadRequestException('INVALID_OGG_STREAM');
    serial = pageSerial;
    if (offset === 0) {
      if (
        !(data[offset + 5] & 2) ||
        payloadLength < 19 ||
        data.toString('ascii', headerEnd, headerEnd + 8) !== 'OpusHead' ||
        data[headerEnd + 8] !== 1 ||
        ![1, 2].includes(data[headerEnd + 9]) ||
        data[headerEnd + 18] !== 0
      )
        throw new BadRequestException('VOICE_REQUIRES_OGG_OPUS');
      preSkip = data.readUInt16LE(headerEnd + 10);
    }
    if (data.toString('ascii', headerEnd, headerEnd + 8) === 'OpusTags')
      tags = true;
    ended = Boolean(data[offset + 5] & 4);
    const granule = data.readBigUInt64LE(offset + 6);
    if (granule !== 0xffffffffffffffffn && granule > lastGranule)
      lastGranule = granule;
    offset = headerEnd + payloadLength;
  }
  if (!tags || !ended) throw new BadRequestException('INCOMPLETE_OGG_OPUS');
  const duration = (Number(lastGranule) - preSkip) / 48000;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
    throw new BadRequestException('INVALID_VOICE_DURATION');
  return Math.ceil(duration);
}

export function validateCrmChatUpload(input: {
  data: Buffer;
  fileName: string;
  mimeType: string;
  kind: 'IMAGE' | 'FILE' | 'VOICE';
}) {
  if (!input.data.length || input.data.length > CRM_CHAT_MEDIA_LIMIT)
    throw new PayloadTooLargeException('CHAT_MEDIA_LIMIT_10_MIB');
  if (input.fileName !== crmSafeFileName(input.fileName))
    throw new BadRequestException('UNSAFE_FILE_NAME');
  const mimeType = input.mimeType.split(';', 1)[0].trim().toLowerCase();
  if (!FILE_MIMES.has(mimeType))
    throw new BadRequestException('UNSUPPORTED_MEDIA_TYPE');
  const imageMime = input.data
    .subarray(0, 3)
    .equals(Buffer.from([255, 216, 255]))
    ? 'image/jpeg'
    : input.data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : input.data.toString('ascii', 0, 4) === 'RIFF' &&
          input.data.toString('ascii', 8, 12) === 'WEBP'
        ? 'image/webp'
        : null;
  if (
    (input.kind === 'IMAGE' || mimeType.startsWith('image/')) &&
    imageMime !== mimeType
  )
    throw new BadRequestException('IMAGE_SIGNATURE_MISMATCH');
  if (
    mimeType === 'audio/webm' &&
    (!input.data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ||
      !input.data.subarray(0, 4096).includes(Buffer.from('webm')))
  )
    throw new BadRequestException('AUDIO_CONTAINER_MISMATCH');
  if (
    (mimeType === 'audio/mp4' || mimeType === 'video/mp4') &&
    (input.data.length < 12 || input.data.toString('ascii', 4, 8) !== 'ftyp')
  )
    throw new BadRequestException('AUDIO_CONTAINER_MISMATCH');
  if (input.kind === 'VOICE') {
    if (mimeType !== 'audio/ogg')
      throw new BadRequestException('VOICE_REQUIRES_OGG_OPUS');
    return { duration: crmVoiceDuration(input.data) };
  }
  if (
    mimeType === 'application/pdf' &&
    input.data.toString('ascii', 0, 5) !== '%PDF-'
  )
    throw new BadRequestException('DOCUMENT_SIGNATURE_MISMATCH');
  return { duration: undefined };
}
