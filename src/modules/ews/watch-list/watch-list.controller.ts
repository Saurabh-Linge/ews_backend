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
import { WatchListService } from './watch-list.service';

@Controller('ews/watch-list')
export class WatchListController {
  constructor(private readonly service: WatchListService) {}

  @Get()
  findAll(
    @Query('branch') branch?: string,
    @Query('risk_level') risk_level?: string,
    @Query('source') source?: string,
    @Query('status') status?: string,
    @Query('branch_ids') branch_ids?: string,
    @Query('signal_id') signal_id?: string,
    @Query('rule_name') rule_name?: string,
    @Query('loan_type') loan_type?: string,
  ) {
    return this.service.findAll({
      branch,
      risk_level,
      source,
      status,
      branch_ids,
      signal_id,
      rule_name,
      loan_type,
    });
  }

  @Get('stats')
  getStats(
    @Query('branch_ids') branch_ids?: string,
    @Query('role') role?: string,
  ) {
    return this.service.getStats({ branch_ids, role });
  }

  @Get('branch-stats')
  getBranchStats(@Query('branch_ids') branch_ids?: string) {
    return this.service.getBranchStats({ branch_ids });
  }

  @Get(':id/details')
  getDetails(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDetails(id);
  }

  @Get('dump/:id/details')
  getDumpDetails(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDumpDetails(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  add(@Body() body: any) {
    return this.service.add(body);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
    @Body('updated_by') updatedBy: string,
    @Body('remarks') remarks?: string,
  ) {
    return this.service.updateStatus(id, status, updatedBy, remarks);
  }

  @Patch(':id/risk')
  updateRisk(
    @Param('id', ParseIntPipe) id: number,
    @Body('risk_level') riskLevel: string,
  ) {
    return this.service.updateRisk(id, riskLevel);
  }

  @Patch(':id/remove')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Body('removed_by') removedBy: string,
    @Body('resolution') resolution: string,
  ) {
    return this.service.remove(id, removedBy, resolution);
  }
}
