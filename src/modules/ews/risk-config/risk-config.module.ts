import { Module } from '@nestjs/common';
import { RiskConfigService } from './risk-config.service';
import { RiskConfigController } from './risk-config.controller';

@Module({
  controllers: [RiskConfigController],
  providers: [RiskConfigService],
  exports: [RiskConfigService],
})
export class RiskConfigModule {}
