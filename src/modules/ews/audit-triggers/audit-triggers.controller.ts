import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { AuditTriggersService } from './audit-triggers.service';

@Controller('ews/audit-triggers')
export class AuditTriggersController {
  constructor(private readonly service: AuditTriggersService) {}

  /**
   * POST /ews/audit-triggers/receive
   * Called by AuditPro when an audit questionnaire triggers EWS signals.
   */
  @Post('receive')
  receiveFromAuditPro(@Body() payload: any) {
    return this.service.receiveFromAuditPro(payload);
  }

  @Get('watch-list/:id')
  findByWatchList(@Param('id', ParseIntPipe) id: number) {
    return this.service.findByWatchListId(id);
  }
}
