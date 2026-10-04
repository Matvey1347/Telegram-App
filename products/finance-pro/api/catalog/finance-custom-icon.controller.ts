import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  FinanceConsumerAuthGuard,
  type FinanceImportRequest,
} from '../portability/finance-consumer-auth.guard';
import { CreateFinanceCustomIconDto } from './finance-custom-icon.dto';
import { FinanceCustomIconService } from './finance-custom-icon.service';

@Controller('finance-bots/:botId/custom-icons')
@UseGuards(FinanceConsumerAuthGuard)
export class FinanceCustomIconController {
  constructor(private readonly icons: FinanceCustomIconService) {}

  @Get()
  list(@Req() request: FinanceImportRequest) {
    return this.icons.list(request.financeConsumerSession.profileId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        callback(
          file.mimetype.startsWith('image/')
            ? null
            : new BadRequestException('Image file is required'),
          file.mimetype.startsWith('image/'),
        );
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.icons.upload(file);
  }

  @Post()
  save(
    @Req() request: FinanceImportRequest,
    @Body() dto: CreateFinanceCustomIconDto,
  ) {
    return this.icons.save(request.financeConsumerSession.profileId, dto);
  }
}
