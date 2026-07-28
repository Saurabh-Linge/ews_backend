import { Module } from '@nestjs/common';
import { EwsReportsService } from './ews-reports.service';
import { EwsReportsController } from './ews-reports.controller';

@Module({
  controllers: [EwsReportsController],
  providers: [EwsReportsService],
  exports: [EwsReportsService],
})
export class EwsReportsModule {}
