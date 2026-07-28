import { Module } from '@nestjs/common';
import { RiskControlService } from './risk-control.service';
import { RiskControlController } from './risk-control.controller';

@Module({
  controllers: [RiskControlController],
  providers: [RiskControlService],
  exports: [RiskControlService],
})
export class RiskControlModule {}
