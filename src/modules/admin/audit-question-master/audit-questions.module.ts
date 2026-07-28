import { Module } from '@nestjs/common';
import { AuditQuestionMasterController } from './audit-questions.controller';
import { AuditQuestionMasterService } from './audit-questions.service';

@Module({
  controllers: [AuditQuestionMasterController],
  providers: [AuditQuestionMasterService],
})
export class AuditQuestionsModule {}
