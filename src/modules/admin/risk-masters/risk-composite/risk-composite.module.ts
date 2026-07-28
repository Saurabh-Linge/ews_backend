import { Module } from '@nestjs/common';
import { RiskCompositeService } from './risk-composite.service';
import { RiskCompositeController } from './risk-composite.controller';

@Module({
  controllers: [RiskCompositeController],
  providers: [RiskCompositeService],
  exports: [RiskCompositeService],
})
export class RiskCompositeModule {}
