import { Module } from '@nestjs/common';
import { CommonModule } from '../../../common/common.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { WorkspaceCreativesController } from './workspace-creatives.controller';
import { WorkspaceCreativesService } from './workspace-creatives.service';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [WorkspaceCreativesController],
  providers: [WorkspaceCreativesService],
})
export class WorkspaceCreativesModule {}
