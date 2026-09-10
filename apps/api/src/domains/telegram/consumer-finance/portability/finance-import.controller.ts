import {
  BadRequestException,
  Controller,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StreamResponseService } from '../../../../common/stream/stream-response.service';
import {
  FinanceConsumerAuthGuard,
  type FinanceImportRequest,
} from './finance-consumer-auth.guard';
import { FinanceImportService } from './finance-import.service';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

@Controller('finance-bots/:botId')
@UseGuards(FinanceConsumerAuthGuard)
export class FinanceImportController {
  constructor(
    private readonly imports: FinanceImportService,
    private readonly streams: StreamResponseService,
  ) {}

  @Post('import-stream')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
      fileFilter: (_request, file, callback) => {
        const accepted =
          file.mimetype === 'application/json' ||
          file.mimetype === 'text/json' ||
          file.mimetype === 'text/plain' ||
          file.originalname.toLowerCase().endsWith('.json');
        callback(
          accepted
            ? null
            : new BadRequestException('Only JSON files are supported'),
          accepted,
        );
      },
    }),
  )
  streamImport(
    @Req() request: FinanceImportRequest,
    @Res() response: Response,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.streams.stream(response, {
      eventPrefix: 'consumer-finance.import',
      persistLifecycleLogs: false,
      action: async (onProgress, signal) => {
        if (!file) throw new BadRequestException('Import file is required');
        let document: unknown;
        try {
          document = JSON.parse(file.buffer.toString('utf8')) as unknown;
        } catch {
          throw new BadRequestException({
            code: 'FINANCE_IMPORT_INVALID_JSON',
            message: 'The import file is not valid JSON',
            path: '$',
          });
        }
        return this.imports.import(
          request.financeConsumerSession.profileId,
          document,
          onProgress,
          signal,
        );
      },
    });
  }
}
