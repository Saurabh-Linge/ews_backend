import { Module } from '@nestjs/common';
import { LoanTypeSignalConfigService } from './loan-type-signal-config.service';
import { LoanTypeSignalConfigController } from './loan-type-signal-config.controller';

@Module({
  controllers: [LoanTypeSignalConfigController],
  providers: [LoanTypeSignalConfigService],
  exports: [LoanTypeSignalConfigService],
})
export class LoanTypeSignalConfigModule {}
