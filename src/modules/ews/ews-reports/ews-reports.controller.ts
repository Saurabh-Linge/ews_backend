import { Controller, Get, Query } from '@nestjs/common';
import { EwsReportsService } from './ews-reports.service';

@Controller('ews/reports')
export class EwsReportsController {
  constructor(private readonly service: EwsReportsService) {}

  // ── Official EWS Reports ───────────────────────────────────────────────────

  @Get('account-signal-detail')
  accountSignalDetail(@Query() query: any) {
    return this.service.getAccountSignalDetailReport(query);
  }

  @Get('branch-wise-summary')
  branchWiseSummary(@Query() query: any) {
    return this.service.getBranchWiseSummaryReport(query);
  }

  @Get('signal-wise-distribution')
  signalWiseDistribution(@Query() query: any) {
    return this.service.getSignalWiseDistributionReport(query);
  }

  @Get('loan-type-risk')
  loanTypeRisk(@Query() query: any) {
    return this.service.getLoanTypeRiskReport(query);
  }

  @Get('cro-dashboard-report')
  croDashboardReport(@Query() query: any) {
    return this.service.getCroDashboardReport(query);
  }

  @Get('rbi-compliance')
  rbiCompliance(@Query() query: any) {
    return this.service.getRbiComplianceReport(query);
  }

  @Get('inspection-due')
  inspectionDue(@Query() query: any) {
    return this.service.getInspectionDueReport(query);
  }

  @Get('insurance-renewal')
  insuranceRenewal(@Query() query: any) {
    return this.service.getInsuranceRenewalReport(query);
  }

  @Get('cersai-pendency')
  cersaiPendency(@Query() query: any) {
    return this.service.getCersaiPendencyReport(query);
  }

  // ── Legacy Report Endpoints ───────────────────────────────────────────────

  @Get('watch-list')
  watchList(@Query() query: any) {
    return this.service.getWatchListReport(query);
  }

  @Get('investigation-status')
  investigationStatus() {
    return this.service.getInvestigationStatusReport();
  }

  @Get('branch-summary')
  branchSummary(@Query() query: any) {
    return this.service.getBranchWiseSummaryReport(query);
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
  signalWise(@Query() query: any) {
    return this.service.getSignalWiseDistributionReport(query);
  }

  @Get('resolved')
  resolved() {
    return this.service.getResolvedReport();
  }
}
