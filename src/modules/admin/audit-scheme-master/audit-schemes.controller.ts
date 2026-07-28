import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';

import { AuditSchemeMasterService } from './audit-schemes.service';
import { CreateAuditSchemeDto, UpdateSchemeDto } from './dto/audit-schemes.dto';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email?: string;
  };
}

@Controller('audit-schemes')
export class AuditSchemeMasterController {
  constructor(private readonly service: AuditSchemeMasterService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('categories/:schemeTypeId')
  getCategories(@Param('schemeTypeId', ParseIntPipe) schemeTypeId: number) {
    return this.service.getCategoriesBySchemeType(schemeTypeId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAuditSchemeDto, @Req() req: AuthRequest) {
    const admin_id = req.user?.id || 1;

    return this.service.create({
      ...dto,
      admin_id,
    });
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchemeDto,
    @Req() req: AuthRequest,
  ) {
    const admin_id = req.user?.id || 1;

    return this.service.update(id, {
      ...dto,
      admin_id,
    });
  }

  @Patch(':id/status')
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggleStatus(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.softDelete(id);
  }
}
