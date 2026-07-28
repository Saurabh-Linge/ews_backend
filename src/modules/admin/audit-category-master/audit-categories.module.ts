import { Module } from '@nestjs/common';
import { AuditCategoryMasterController } from './audit-categories.controller';
import { AuditCategoryMasterService } from './audit-categories.service';

@Module({
  controllers: [AuditCategoryMasterController],
  providers: [AuditCategoryMasterService],
})
export class AuditCategoriesModule {}
