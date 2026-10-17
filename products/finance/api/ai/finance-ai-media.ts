const SUPPORTED_VOICE_MIME_TYPES = new Set([
  'audio/ogg',
  'application/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
]);

export function isSupportedFinanceVoiceMime(mime: string) {
  return SUPPORTED_VOICE_MIME_TYPES.has(mime);
}

export function financeVoiceFileName(mime: string) {
  if (mime.includes('ogg')) return 'voice.ogg';
  if (mime.includes('mpeg')) return 'voice.mp3';
  if (mime.includes('mp4')) return 'voice.mp4';
  if (mime.includes('webm')) return 'voice.webm';
  return 'voice.wav';
}
