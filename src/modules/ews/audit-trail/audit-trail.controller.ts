import { Controller, Get, Query } from '@nestjs/common';
import { AuditTrailService } from './audit-trail.service';

@Controller('ews/audit-trail')
export class AuditTrailController {
  constructor(private readonly service: AuditTrailService) {}

  @Get()
  findAll(
    @Query('branch') branch?: string,
    @Query('action') action?: string,
    @Query('performed_by') performed_by?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      branch,
      action,
      performed_by,
      limit: limit ? parseInt(limit) : undefined,
    });
  }
}
