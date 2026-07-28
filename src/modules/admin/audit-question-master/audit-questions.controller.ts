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

import { AuditQuestionMasterService } from './audit-questions.service';
import {
  CreateQuestionSetDto,
  UpdateQuestionSetDto,
  CreateQuestionHeaderDto,
  UpdateQuestionHeaderDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  CreateQuestionRiskMappingDto,
} from './dto/audit-questions.dto';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email?: string;
  };
}

@Controller('audit-question-master')
export class AuditQuestionMasterController {
  constructor(private readonly service: AuditQuestionMasterService) {}

  @Get('sets')
  findAllSets() {
    return this.service.findAllSets();
  }

  @Get('sets/:id')
  findOneSet(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOneSet(id);
  }

  @Post('sets')
  createSet(@Body() dto: CreateQuestionSetDto, @Req() req: AuthRequest) {
    const admin_id = req.user?.id || 1;

    return this.service.createSet({
      ...dto,
      admin_id,
    });
  }

  @Patch('sets/:id')
  updateSet(
    @Param('id', ParseIntPipe) id: number,

    @Body() dto: UpdateQuestionSetDto,

    @Req() req: AuthRequest,
  ) {
    const admin_id = req.user?.id || 1;

    return this.service.updateSet(id, {
      ...dto,
      admin_id,
    });
  }

  @Patch('sets/:id/status')
  toggleSetStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggleSetStatus(id);
  }

  @Delete('sets/:id')
  removeSet(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeSet(id);
  }

  // Question Header

  @Get('headers/:setId')
  findHeadersBySet(@Param('setId', ParseIntPipe) setId: number) {
    return this.service.findHeadersBySet(setId);
  }

  @Get('header/:id')
  findOneHeader(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOneHeader(id);
  }

  @Post('headers')
  createHeader(@Body() dto: CreateQuestionHeaderDto, @Req() req: AuthRequest) {
    const admin_id = req.user?.id || 1;

    return this.service.createHeader({
      ...dto,
      admin_id,
    });
  }

  @Patch('headers/:id')
  updateHeader(
    @Param('id', ParseIntPipe) id: number,

    @Body() dto: UpdateQuestionHeaderDto,

    @Req() req: AuthRequest,
  ) {
    const admin_id = req.user?.id || 1;

    return this.service.updateHeader(id, {
      ...dto,
      admin_id,
    });
  }

  @Patch('headers/:id/status')
  toggleHeaderStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggleHeaderStatus(id);
  }

  @Delete('headers/:id')
  removeHeader(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeHeader(id);
  }

  // Question Master
  @Get('lookups')
  getQuestionLookups() {
    return this.service.getQuestionLookups();
  }

  @Get('questions/:headerId')
  findQuestionsByHeader(
    @Param('headerId', ParseIntPipe)
    headerId: number,
  ) {
    return this.service.findQuestionsByHeader(headerId);
  }

  @Get('question/:id')
  findOneQuestion(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.service.findOneQuestion(id);
  }

  @Post('questions')
  createQuestion(@Body() dto: CreateQuestionDto, @Req() req: AuthRequest) {
    const admin_id = req.user?.id || 1;

    return this.service.createQuestion({
      ...dto,
      admin_id,
    });
  }

  @Patch('questions/:id')
  updateQuestion(
    @Param('id', ParseIntPipe)
    id: number,

    @Body() dto: UpdateQuestionDto,

    @Req() req: AuthRequest,
  ) {
    const admin_id = req.user?.id || 1;

    return this.service.updateQuestion(id, {
      ...dto,
      admin_id,
    });
  }

  @Patch('questions/:id/status')
  toggleQuestionStatus(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.service.toggleQuestionStatus(id);
  }

  @Delete('questions/:id')
  removeQuestion(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.service.removeQuestion(id);
  }

  @Get('questions-set/:setId')
  findQuestionsBySet(
    @Param('setId', ParseIntPipe)
    setId: number,
  ) {
    return this.service.findQuestionsBySet(setId);
  }

  // Question Risk Mapping

  @Get('question-risk-mapping/:questionId')
  findRiskMappings(
    @Param('questionId', ParseIntPipe)
    questionId: number,
  ) {
    return this.service.findRiskMappings(questionId);
  }

  @Post('question-risk-mapping')
  createRiskMapping(
    @Body()
    dto: CreateQuestionRiskMappingDto,

    @Req() req: AuthRequest,
  ) {
    const admin_id = req.user?.id || 1;

    return this.service.createRiskMapping({
      ...dto,
      admin_id,
    });
  }

  @Delete('question-risk-mapping/:id')
  removeRiskMapping(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.service.removeRiskMapping(id);
  }
}
