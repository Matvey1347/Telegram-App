import { Module } from '@nestjs/common';
import { CommonModule } from '../../../common/common.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { WorkspaceRolesController } from './workspace-roles.controller';
import { WorkspaceRolesService } from './workspace-roles.service';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [WorkspaceRolesController],
  providers: [WorkspaceRolesService],
  exports: [WorkspaceRolesService],
})
export class WorkspaceRolesModule {}
