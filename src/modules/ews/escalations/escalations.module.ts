import { Module } from '@nestjs/common';
import { EscalationsService } from './escalations.service';
import { EscalationsController } from './escalations.controller';
import { WatchListModule } from '../watch-list/watch-list.module';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';

@Module({
  imports: [WatchListModule, AuditTrailModule],
  controllers: [EscalationsController],
  providers: [EscalationsService],
  exports: [EscalationsService],
})
export class EscalationsModule {}
