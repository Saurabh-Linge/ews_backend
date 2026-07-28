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
import { InvestigationsService } from './investigations.service';

@Controller('ews/investigations')
export class InvestigationsController {
  constructor(private readonly service: InvestigationsService) {}

  @Get()
  findAll(@Query('branch') branch?: string, @Query('status') status?: string) {
    return this.service.findAll({ branch, status });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post('send')
  send(@Body() body: any) {
    return this.service.sendForInvestigation(body);
  }

  @Patch(':id/respond')
  respond(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.submitBranchResponse(id, body);
  }

  @Patch(':id/remind')
  remind(
    @Param('id', ParseIntPipe) id: number,
    @Body('sent_by') sentBy: string,
  ) {
    return this.service.sendReminder(id, sentBy);
  }
}
