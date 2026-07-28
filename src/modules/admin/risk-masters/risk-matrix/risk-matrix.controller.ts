import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { RiskMatrixService } from './risk-matrix.service';

import { CreateRiskMatrixDto } from './dto/risk-matrix.dto';

@Controller('risk-matrix')
export class RiskMatrixController {
  constructor(private readonly service: RiskMatrixService) {}

  @Get(':yearId')
  findByYear(
    @Param('yearId', ParseIntPipe)
    yearId: number,
  ) {
    return this.service.findByYear(yearId);
  }

  @Post(':yearId')
  saveMatrix(
    @Param('yearId', ParseIntPipe)
    yearId: number,

    @Body()
    data: CreateRiskMatrixDto,
  ) {
    return this.service.saveMatrix(yearId, data);
  }
}
