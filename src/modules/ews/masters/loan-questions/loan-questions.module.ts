
import { Module } from '@nestjs/common';
import { LoanQuestionsController } from './loan-questions.controller';
import { LoanQuestionsService } from './loan-questions.service';
import { CbsRulesModule } from '../../cbs-rules/cbs-rules.module';

@Module({
  imports: [CbsRulesModule],
  controllers: [LoanQuestionsController],
  providers: [LoanQuestionsService],
  exports: [LoanQuestionsService]
})
export class LoanQuestionsModule {}
