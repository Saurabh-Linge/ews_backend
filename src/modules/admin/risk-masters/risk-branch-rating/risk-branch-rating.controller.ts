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

import { BranchRatingService } from './risk-branch-rating.service';

import { CreateBranchRatingDto } from './dto/risk-branch-rating.dto';

@Controller('branch-rating')
export class BranchRatingController {
  constructor(private readonly service: BranchRatingService) {}

  @Get('year/:yearId')
  findByYear(
    @Param('yearId', ParseIntPipe)
    yearId: number,
  ) {
    return this.service.findByYear(yearId);
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
    data: CreateBranchRatingDto,
  ) {
    return this.service.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe)
    id: number,

    @Body()
    data: CreateBranchRatingDto,
  ) {
    return this.service.update(id, data);
  }

  @Patch(':id/toggle-status')
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
