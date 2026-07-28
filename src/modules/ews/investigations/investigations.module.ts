import { Module } from '@nestjs/common';
import { InvestigationsService } from './investigations.service';
import { InvestigationsController } from './investigations.controller';
import { WatchListModule } from '../watch-list/watch-list.module';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';

@Module({
  imports: [WatchListModule, AuditTrailModule],
  controllers: [InvestigationsController],
  providers: [InvestigationsService],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}
