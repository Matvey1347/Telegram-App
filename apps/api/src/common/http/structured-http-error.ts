import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { TranslationParams } from '@telegram-system/shared';

export type StructuredErrorPayload = {
  code: string;
  params?: TranslationParams;
  /** English compatibility fallback. Clients should translate `code`. */
  message?: string;
  details?: Record<string, unknown> | string | null;
};

export class StructuredHttpException extends HttpException {
  constructor(status: HttpStatus, payload: StructuredErrorPayload) {
    super(payload, status);
  }
}

export class StructuredBadRequestException extends BadRequestException {
  constructor(payload: StructuredErrorPayload) {
    super(payload);
  }
}

export class StructuredNotFoundException extends NotFoundException {
  constructor(payload: StructuredErrorPayload) {
    super(payload);
  }
}

export function badRequest(
  code: string,
  message: string,
  params?: TranslationParams,
) {
  return new StructuredBadRequestException({
    code,
    message,
    ...(params ? { params } : {}),
  });
}

export function notFound(
  code: string,
  message: string,
  params?: TranslationParams,
) {
  return new StructuredNotFoundException({
    code,
    message,
    ...(params ? { params } : {}),
  });
}

export function structuredErrorPayload(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): StructuredErrorPayload {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (response && typeof response === 'object') {
      const payload = response as Partial<StructuredErrorPayload>;
      if (typeof payload.code === 'string') {
        return {
          code: payload.code,
          message:
            typeof payload.message === 'string'
              ? payload.message
              : fallbackMessage,
          ...(payload.params ? { params: payload.params } : {}),
          ...(payload.details !== undefined
            ? { details: payload.details }
            : {}),
        };
      }
    }
  }
  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : fallbackMessage,
  };
}
