import { Module } from '@nestjs/common';
import { RiskMatrixService } from './risk-matrix.service';
import { RiskMatrixController } from './risk-matrix.controller';

@Module({
  controllers: [RiskMatrixController],
  providers: [RiskMatrixService],
  exports: [RiskMatrixService],
})
export class RiskMatrixModule {}
