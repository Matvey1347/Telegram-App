import { BadRequestException } from '@nestjs/common';

export function requireInternalNotificationTarget(targetUrl: string) {
  if (
    !targetUrl.startsWith('/') ||
    targetUrl.startsWith('//') ||
    targetUrl.includes('\\') ||
    /[\u0000-\u001f]/.test(targetUrl)
  ) {
    throw new BadRequestException('Notification target must be internal');
  }
  return targetUrl;
}
