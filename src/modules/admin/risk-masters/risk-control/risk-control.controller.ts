import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { RiskControlService } from './risk-control.service';

import {
  CreateRiskControlDto,
  CreateRiskControlKeyAspectDto,
} from './dto/risk-control.dto';

@Controller('risk-controls')
export class RiskControlController {
  constructor(private readonly service: RiskControlService) {}

  // RISK CONTROL MASTER

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body()
    data: CreateRiskControlDto,
  ) {
    return this.service.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,

    @Body()
    data: CreateRiskControlDto,
  ) {
    return this.service.update(id, data);
  }

  @Patch(':id/status')
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggleStatus(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  // KEY ASPECTS

  @Get(':id/key-aspects')
  findAllKeyAspects(@Param('id', ParseIntPipe) id: number) {
    return this.service.findAllKeyAspects(id);
  }

  @Post('key-aspects')
  createKeyAspect(
    @Body()
    data: CreateRiskControlKeyAspectDto,
  ) {
    return this.service.createKeyAspect(data);
  }

  @Patch('key-aspects/:id')
  updateKeyAspect(
    @Param('id', ParseIntPipe) id: number,

    @Body()
    data: CreateRiskControlKeyAspectDto,
  ) {
    return this.service.updateKeyAspect(id, data);
  }

  @Delete('key-aspects/:id')
  removeKeyAspect(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeKeyAspect(id);
  }
}
