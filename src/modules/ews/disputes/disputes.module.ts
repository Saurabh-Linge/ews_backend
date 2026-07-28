import { Module, forwardRef } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';
import { WatchListModule } from '../watch-list/watch-list.module';

@Module({
  imports: [AuditTrailModule, forwardRef(() => WatchListModule)],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
