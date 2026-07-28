import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Req,
  Delete,
} from '@nestjs/common';
import { MenuMasterService } from './menu-master.service';
import { CreateMenuMasterDto } from './dto/menu-master.dto';

@Controller('menu-masters')
export class MenuMastersController {
  constructor(private readonly service: MenuMasterService) {}

  @Get()
  getAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateMenuMasterDto, @Req() req) {
    const admin_id = req.user?.id || 1;
    return this.service.create({ ...dto, admin_id });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateMenuMasterDto) {
    return this.service.update(Number(id), dto.name);
  }

  @Put(':id/toggle-status')
  toggleStatus(@Param('id') id: string) {
    return this.service.toggleStatus(Number(id));
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.softDelete(Number(id));
  }
}
