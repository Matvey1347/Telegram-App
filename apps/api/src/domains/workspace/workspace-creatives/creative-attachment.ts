import { BadRequestException } from '@nestjs/common';
import { creativeFileSizeLimit } from '@telegram-system/shared';
import type { CreativeFileType } from '@telegram-system/shared';

function detectType(bytes: Buffer): CreativeFileType | undefined {
  if (bytes.length < 12) return undefined;
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    return 'image/png';
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('latin1', 0, 6)))
    return 'image/gif';
  if (
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.toString('latin1', 4, 8) === 'ftyp') return 'video/mp4';
  if (
    bytes.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) &&
    bytes.subarray(4, 64).includes('webm')
  ) {
    return 'video/webm';
  }
  return undefined;
}

export function creativeAttachment(file?: Express.Multer.File) {
  if (!file) return undefined;
  const mimeType = detectType(file.buffer);
  if (
    !mimeType ||
    !file.buffer.length ||
    file.buffer.length > creativeFileSizeLimit
  ) {
    throw new BadRequestException('Invalid creative attachment');
  }
  return {
    bytes: new Uint8Array(file.buffer),
    mimeType,
    name: file.originalname.replace(/\p{Cc}/gu, '').slice(0, 255) || 'media',
  };
}
