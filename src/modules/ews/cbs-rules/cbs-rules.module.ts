import { Module } from '@nestjs/common';
import { CbsRulesService } from './cbs-rules.service';
import { CbsRulesController } from './cbs-rules.controller';

@Module({
  controllers: [CbsRulesController],
  providers: [CbsRulesService],
  exports: [CbsRulesService],
})
export class CbsRulesModule {}
