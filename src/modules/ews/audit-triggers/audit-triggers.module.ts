import { Module } from '@nestjs/common';
import { AuditTriggersService } from './audit-triggers.service';
import { AuditTriggersController } from './audit-triggers.controller';
import { WatchListModule } from '../watch-list/watch-list.module';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';

@Module({
  imports: [WatchListModule, AuditTrailModule],
  controllers: [AuditTriggersController],
  providers: [AuditTriggersService],
  exports: [AuditTriggersService],
})
export class AuditTriggersModule {}
