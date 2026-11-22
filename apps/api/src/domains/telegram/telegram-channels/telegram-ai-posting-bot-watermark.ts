import { BadRequestException } from '@nestjs/common';

export function validateBotWatermark(input: {
  index: number;
  enabled: boolean;
  size: number;
  opacity: number;
  x: number;
  y: number;
}) {
    const inRange = (value: unknown, min: number, max: number) =>
      typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
    if (!input || !Number.isInteger(input.index) || input.index < 0 ||
      typeof input.enabled !== 'boolean' || !inRange(input.size, 5, 30) ||
      !inRange(input.opacity, 10, 100) || !inRange(input.x, 0, 100) || !inRange(input.y, 0, 100))
      throw new BadRequestException('Invalid watermark settings');

}
