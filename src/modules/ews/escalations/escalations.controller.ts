import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { EscalationsService } from './escalations.service';

@Controller('ews/escalations')
export class EscalationsController {
  constructor(private readonly service: EscalationsService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.service.findAll(status);
  }

  @Post()
  escalate(@Body() body: any) {
    return this.service.escalate(body);
  }

  @Patch(':id/decide')
  decide(
    @Param('id', ParseIntPipe) id: number,
    @Body('decision') decision: any,
    @Body('decided_by') decidedBy: string,
    @Body('notes') notes?: string,
  ) {
    return this.service.decide(id, decision, decidedBy, notes);
  }
}
