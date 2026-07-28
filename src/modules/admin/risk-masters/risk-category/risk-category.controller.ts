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

import { RiskCategoryService } from './risk-category.service';

import {
  CreateRiskCategoryDto,
  CreateRiskCategoryWeightDto,
  UpdateRiskCategoryDto,
} from './dto/risk-category.dto';

@Controller('risk-categories')
export class RiskCategoryController {
  constructor(private readonly service: RiskCategoryService) {}

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
    data: CreateRiskCategoryDto,
  ) {
    return this.service.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,

    @Body()
    data: UpdateRiskCategoryDto,
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

  // Risk Category Weights

  @Get(':id/weights')
  findAllWeights(@Param('id', ParseIntPipe) id: number) {
    return this.service.findAllWeights(id);
  }

  @Post('weights')
  createWeight(
    @Body()
    data: CreateRiskCategoryWeightDto,
  ) {
    return this.service.createWeight(data);
  }

  @Patch('weights/:id')
  updateWeight(
    @Param('id', ParseIntPipe) id: number,

    @Body()
    data: CreateRiskCategoryWeightDto,
  ) {
    return this.service.updateWeight(id, data);
  }

  @Delete('weights/:id')
  removeWeight(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeWeight(id);
  }

  @Get('lookups/years')
  getYears() {
    return this.service.getYears();
  }
}
