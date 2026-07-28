import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { CbsRulesService } from './cbs-rules.service';

@Controller('ews/cbs-rules')
export class CbsRulesController {
  constructor(private readonly service: CbsRulesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Post('validate')
  async validateExpression(@Body() body: { expression: string }) {
    return await this.service.validateExpression(body.expression);
  }

  @Post('simulate')
  simulate(@Body() body: { rules: { name: string; expression: string }[]; minMatchCount?: number; page?: number; limit?: number; branchCode?: string; watchListFilter?: 'all' | 'flagged' | 'new' }) {
    return this.service.simulateRules(
      body.rules,
      body.minMatchCount || 1,
      body.page || 1,
      body.limit || 50,
      body.branchCode,
      body.watchListFilter || 'all'
    );
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.update(id, body);
  }

  /** Re-run ALL enabled rules against the current loan dump */
  @Post('apply-rules')
  applyRules() {
    return this.service.reflagAll();
  }

  /** Re-run a SINGLE rule against the current loan dump */
  @Post('apply-rules/:id')
  applySingleRule(@Param('id', ParseIntPipe) id: number) {
    return this.service.reflagSingleRule(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
