import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { JwtUser } from '../../../common/current-user.decorator';
import { CurrentUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  AssignWorkspaceRoleDto,
  CopyWorkspaceRoleDto,
  CreateWorkspaceRoleDto,
  UpdateWorkspaceRoleDto,
} from './dto';
import { WorkspaceRolesService } from './workspace-roles.service';

@UseGuards(JwtAuthGuard)
@Controller('workspace-roles')
export class WorkspaceRolesController {
  constructor(private readonly service: WorkspaceRolesService) {}

  @Get('registry')
  registry(@CurrentUser() user: JwtUser) {
    return this.service.registry(user.sub);
  }

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.sub);
  }

  @Get(':roleId')
  detail(@CurrentUser() user: JwtUser, @Param('roleId') roleId: string) {
    return this.service.detail(user.sub, roleId);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateWorkspaceRoleDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':roleId')
  update(
    @CurrentUser() user: JwtUser,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateWorkspaceRoleDto,
  ) {
    return this.service.update(user.sub, roleId, dto);
  }

  @Post(':roleId/copy')
  copy(
    @CurrentUser() user: JwtUser,
    @Param('roleId') roleId: string,
    @Body() dto: CopyWorkspaceRoleDto,
  ) {
    return this.service.copy(user.sub, roleId, dto);
  }

  @Post(':roleId/members')
  assign(
    @CurrentUser() user: JwtUser,
    @Param('roleId') roleId: string,
    @Body() dto: AssignWorkspaceRoleDto,
  ) {
    return this.service.assignMembers(user.sub, roleId, dto.memberIds);
  }

  @Delete(':roleId')
  remove(@CurrentUser() user: JwtUser, @Param('roleId') roleId: string) {
    return this.service.remove(user.sub, roleId);
  }
}
