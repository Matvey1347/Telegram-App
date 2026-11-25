import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { creativeFileSizeLimit } from '@telegram-system/shared';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  CreateCreativeCommentDto,
  CreateCreativeDto,
  CreativeListDto,
} from './workspace-creatives.dto';
import { WorkspaceCreativesService } from './workspace-creatives.service';

@UseGuards(JwtAuthGuard)
@Controller('workspace-creatives/:workspaceId')
export class WorkspaceCreativesController {
  constructor(private readonly service: WorkspaceCreativesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @CurrentUser() user: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Query() query: CreativeListDto,
  ) {
    return this.service.list(user.sub, workspaceId, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  get(
    @CurrentUser() user: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.service.get(user.sub, workspaceId, id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: creativeFileSizeLimit + 1,
        fields: 6,
        fieldSize: 50_000,
        files: 1,
      },
    }),
  )
  create(
    @CurrentUser() user: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateCreativeDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(user.sub, workspaceId, dto, file);
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() user: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: CreateCreativeCommentDto,
  ) {
    return this.service.addComment(user.sub, workspaceId, id, dto.text);
  }

  @Get(':id/attachment')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async attachment(
    @CurrentUser() user: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    const attachment = await this.service.attachment(user.sub, workspaceId, id);
    return new StreamableFile(attachment.bytes, { type: attachment.mimeType });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    await this.service.remove(user.sub, workspaceId, id);
  }
}
