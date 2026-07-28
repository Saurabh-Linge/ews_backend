import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { RiskCompositeService } from './risk-composite.service';

import { CreateRiskCompositeDto } from './dto/risk-composite.dto';

@Controller('risk-composites')
export class RiskCompositeController {
  constructor(private readonly service: RiskCompositeService) {}

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
    data: CreateRiskCompositeDto,
  ) {
    return this.service.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,

    @Body()
    data: CreateRiskCompositeDto,
  ) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
