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
import { DisputesService } from './disputes.service';

@Controller('ews/disputes')
export class DisputesController {
  constructor(private readonly service: DisputesService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.service.findAll(status);
  }

  @Post()
  raise(@Body() body: any) {
    return this.service.raise(body);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body('decision') decision: any,
    @Body('resolved_by') resolvedBy: string,
    @Body('notes') notes?: string,
  ) {
    return this.service.resolve(id, decision, resolvedBy, notes);
  }
}
