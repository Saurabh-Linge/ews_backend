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

import { AuditUnitsService } from './audit-units.service';
import {
  CreateAuditUnitDto,
  CreateTargetDto,
  UpdateAuditUnitDto,
  UpdateAuditUnitFrequencyDto,
  UpdateTargetDto,
} from './dto/audit-unit.dto';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email?: string;
  };
}

@Controller('audit-units')
export class AuditUnitsController {
  constructor(private readonly service: AuditUnitsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('lookups')
  getLookups() {
    return this.service.getLookups();
  }

  @Get('frequency-options')
  getFrequencyOptions() {
    return this.service.getFrequencyOptions();
  }

  @Get('frequencies')
  findFrequencies() {
    return this.service.findFrequencies();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAuditUnitDto, @Req() req: AuthRequest) {
    const admin_id = req.user?.id || 1;
    return this.service.create({ ...dto, admin_id });
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAuditUnitDto,
    @Req() req: AuthRequest,
  ) {
    const admin_id = req.user?.id || 1;
    return this.service.update(id, { ...dto, admin_id });
  }

  @Patch(':id/status')
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggleStatus(id);
  }

  @Patch(':id/frequency')
  updateFrequency(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAuditUnitFrequencyDto,
    @Req() req: AuthRequest,
  ) {
    const admin_id = req.user?.id || 1;
    return this.service.updateFrequency(id, dto.frequency, admin_id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.softDelete(id);
  }

  @Post('create-target')
  createTarget(@Body() dto: CreateTargetDto, @Req() req: AuthRequest) {
    const admin_id = req.user?.id || 1;
    return this.service.createTarget({ ...dto, admin_id });
  }

  @Get('get-target/:id')
  findByAuditUnit(@Param('id', ParseIntPipe) id: number) {
    return this.service.findByAuditUnit(id);
  }

  @Patch('update-target/:id')
  updateTarget(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTargetDto,
    @Req() req: AuthRequest,
  ) {
    const admin_id = req.user?.id || 1;
    return this.service.updateTarget(id, { ...dto, admin_id });
  }

  @Delete('remove-target/:id')
  removeTarget(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteTarget(id);
  }

  @Get('audit-unit/:auditUnitId/year/:yearId')
  findByAuditAndYear(
    @Param('auditUnitId', ParseIntPipe) auditUnitId: number,
    @Param('yearId', ParseIntPipe) yearId: number,
  ) {
    return this.service.findByAuditAndYear(auditUnitId, yearId);
  }

  @Get('years')
  getYears() {
    return this.service.getYears();
  }
}
