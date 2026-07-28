import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { RiskConfigService } from './risk-config.service';

@Controller('ews/risk-config')
export class RiskConfigController {
  constructor(private readonly service: RiskConfigService) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }

  @Get('changelog')
  getChangeLog() {
    return this.service.getChangeLog();
  }

  @Get(':key')
  get(@Param('key') key: string) {
    return this.service.get(key);
  }

  @Post()
  setBulk(
    @Body() body: { configs: Record<string, string>; changed_by: string },
  ) {
    return this.service.setBulk(body.configs, body.changed_by);
  }
}
