import { Module } from '@nestjs/common';
import { AuditSchemeMasterController } from './audit-schemes.controller';
import { AuditSchemeMasterService } from './audit-schemes.service';

@Module({
  controllers: [AuditSchemeMasterController],
  providers: [AuditSchemeMasterService],
})
export class AuditSchemesModule {}
