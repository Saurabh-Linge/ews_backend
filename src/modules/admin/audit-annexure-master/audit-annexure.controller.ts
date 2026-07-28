import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';

import { Request } from 'express';

import { AuditAnnexureMasterService } from './audit-annexure.service';

import {
  CreateAuditAnnexureColumnDto,
  CreateAuditAnnexureDto,
} from './dto/audit-annexure.dto';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email?: string;
  };
}

@Controller('audit-annexure-master')
export class AuditSchemeMasterController {
  constructor(private readonly service: AuditAnnexureMasterService) {}

  // Annexure Master

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAuditAnnexureDto, @Req() req: AuthRequest) {
    const admin_id = req.user?.id || 1;

    return this.service.create({
      ...dto,
      admin_id,
    });
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAuditAnnexureDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/toggle-status')
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggleStatus(id);
  }

  @Delete(':id')
  softDelete(@Param('id', ParseIntPipe) id: number) {
    return this.service.softDelete(id);
  }

  @Get('lookups')
  getLookups() {
    return this.service.getLookups();
  }

  // Annexure Columns

  @Get(':annexureId/columns')
  findAllColumns(@Param('annexureId', ParseIntPipe) annexureId: number) {
    return this.service.findAllColumns(annexureId);
  }

  @Post('columns')
  createColumn(
    @Body() dto: CreateAuditAnnexureColumnDto,
    @Req() req: AuthRequest,
  ) {
    const admin_id = req.user?.id || 1;

    return this.service.createColumn({
      ...dto,
      admin_id,
    });
  }

  @Put('columns/:id')
  updateColumn(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAuditAnnexureColumnDto,
  ) {
    return this.service.updateColumn(id, dto);
  }

  @Delete('columns/:id')
  deleteColumn(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteColumn(id);
  }
}
