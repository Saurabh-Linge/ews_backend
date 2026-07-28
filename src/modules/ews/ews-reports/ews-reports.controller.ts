import { Controller, Get, Query } from '@nestjs/common';
import { EwsReportsService } from './ews-reports.service';

@Controller('ews/reports')
export class EwsReportsController {
  constructor(private readonly service: EwsReportsService) {}

  @Get('watch-list')
  watchList() {
    return this.service.getWatchListReport();
  }

  @Get('investigation-status')
  investigationStatus() {
    return this.service.getInvestigationStatusReport();
  }

  @Get('branch-summary')
  branchSummary() {
    return this.service.getBranchSummaryReport();
  }

  @Get('bank-wide')
  bankWide() {
    return this.service.getBankWideReport();
  }

  @Get('high-risk')
  highRisk() {
    return this.service.getHighRiskReport();
  }

  @Get('overdue')
  overdue() {
    return this.service.getOverdueReport();
  }

  @Get('signal-wise')
  signalWise() {
    return this.service.getSignalWiseReport();
  }

  @Get('resolved')
  resolved() {
    return this.service.getResolvedReport();
  }
}
