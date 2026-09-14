import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  B2ObjectStorageService,
  isSupportedImmutableImageMimeType,
} from '../../../../common/object-storage/b2-object-storage.service';
import { CreateFinanceCustomIconDto } from './finance-custom-icon.dto';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class FinanceCustomIconService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: B2ObjectStorageService,
  ) {}

  list(profileId: string) {
    return this.prisma.financeCustomIcon.findMany({
      where: { profileId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, name: true, imageUrl: true },
    });
  }

  async upload(file: Express.Multer.File | undefined) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    if (
      file.size > MAX_IMAGE_BYTES ||
      !isSupportedImmutableImageMimeType(file.mimetype)
    ) {
      throw new BadRequestException(
        'Upload a JPEG, PNG, WebP, or GIF image up to 2 MB',
      );
    }
    const result = await this.storage.persistImmutableImages([
      { bytes: file.buffer, mimeType: file.mimetype },
    ]);
    return { imageUrl: result.urls[0] };
  }

  async save(profileId: string, dto: CreateFinanceCustomIconDto) {
    const name = dto.name.trim();
    const imageUrl = dto.imageUrl.trim();
    if (!name || !imageUrl) {
      throw new BadRequestException('Icon name and image are required');
    }
    return this.prisma.financeCustomIcon.upsert({
      where: { profileId_name: { profileId, name } },
      update: { imageUrl },
      create: { profileId, name, imageUrl },
      select: { id: true, name: true, imageUrl: true },
    });
  }
}
