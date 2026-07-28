import { Module } from '@nestjs/common';
import { CbsUploadService } from './cbs-upload.service';
import { CbsUploadController } from './cbs-upload.controller';
import { CbsRulesModule } from '../cbs-rules/cbs-rules.module';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';
import { DisputesModule } from '../disputes/disputes.module';

@Module({
  imports: [CbsRulesModule, AuditTrailModule, DisputesModule],
  controllers: [CbsUploadController],
  providers: [CbsUploadService],
  exports: [CbsUploadService],
})
export class CbsUploadModule {}
