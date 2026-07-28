import { Module } from '@nestjs/common';
import { AuditUnitsController } from './audit-units.controller';
import { AuditUnitsService } from './audit-units.service';

@Module({
  controllers: [AuditUnitsController],
  providers: [AuditUnitsService],
})
export class AuditUnitsModule {}
