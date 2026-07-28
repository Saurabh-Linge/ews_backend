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

import { AuditCategoryMasterService } from './audit-categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateQuestionMappingDto,
} from './dto/audit-categories.dto';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email?: string;
  };
}

@Controller('audit-category-master')
export class AuditCategoryMasterController {
  constructor(private readonly service: AuditCategoryMasterService) {}

  @Get('question-mapping/:id')
  getQuestionMapping(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.service.getQuestionMapping(id);
  }

  @Patch('question-mapping/:id')
  updateQuestionMapping(
    @Param('id', ParseIntPipe)
    id: number,

    @Body()
    dto: UpdateQuestionMappingDto,
  ) {
    return this.service.updateQuestionMapping(id, dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('lookups')
  getLookups() {
    return this.service.getLookups();
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body()
    dto: CreateCategoryDto,
  ) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe)
    id: number,

    @Body()
    dto: UpdateCategoryDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  toggleStatus(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.service.toggleStatus(id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.service.remove(id);
  }
}
