import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { TrashService } from './trash.service';

@Controller('trash')
export class TrashController {
  constructor(private readonly trash: TrashService) {}
  @Get() list(
    @CurrentUser() user: JwtUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.trash.list(
      user.sub,
      Number(page) || 1,
      Math.min(100, Number(pageSize) || 25),
    );
  }
  @Patch(':kind/:id/restore') restore(
    @CurrentUser() user: JwtUser,
    @Param('kind') kind: Parameters<TrashService['restore']>[1],
    @Param('id') id: string,
  ) {
    return this.trash.restore(user.sub, kind, id);
  }
}
