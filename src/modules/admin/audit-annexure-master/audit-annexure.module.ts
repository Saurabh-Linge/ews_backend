import { Module } from '@nestjs/common';
import { AuditSchemeMasterController } from './audit-annexure.controller';
import { AuditAnnexureMasterService } from './audit-annexure.service';

@Module({
  controllers: [AuditSchemeMasterController],
  providers: [AuditAnnexureMasterService],
})
export class AuditAnnexureModule {}
