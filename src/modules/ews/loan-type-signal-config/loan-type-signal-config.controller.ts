import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { LoanTypeSignalConfigService } from './loan-type-signal-config.service';

@Controller('ews/loan-type-config')
export class LoanTypeSignalConfigController {
  constructor(private readonly service: LoanTypeSignalConfigService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('summary')
  getSummary() {
    return this.service.getSummary();
  }

  @Get('loan-types')
  getLoanTypes() {
    return this.service.getLoanTypes();
  }

  @Get(':loanType')
  findByLoanType(@Param('loanType') loanType: string) {
    return this.service.findByLoanType(decodeURIComponent(loanType));
  }

  @Post('update')
  update(
    @Body()
    body: {
      signal_id: number;
      loan_type: string;
      applicability: 'Y' | 'C' | 'N';
      changed_by: string;
    },
  ) {
    return this.service.update(
      body.signal_id,
      body.loan_type,
      body.applicability,
      body.changed_by,
    );
  }
}
