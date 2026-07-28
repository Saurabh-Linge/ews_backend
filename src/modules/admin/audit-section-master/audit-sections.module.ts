import { Module } from '@nestjs/common';
import { AuditSectionService } from './audit-sections.service';
import { AuditSectionsController } from './audit-sections.controller';

@Module({
  controllers: [AuditSectionsController],
  providers: [AuditSectionService],
})
export class AuditSectionsModule {}
