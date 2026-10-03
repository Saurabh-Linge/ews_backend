
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { LoanQuestionsService } from './loan-questions.service';

@Controller('ews/loan-questions')
export class LoanQuestionsController {
  constructor(private readonly service: LoanQuestionsService) {}

  // ── List all (admin) ──────────────────────────────────────────
  @Get()
  findAll(@Query('category') category?: string) { return this.service.findAll(category); }

  // ── Specific named routes MUST come before :id wildcard ───────

  /**
   * GET /ews/loan-questions/for-account?account_id=AJR001&category=retail
   * Returns active questions + saved answers for an account (by account_id string)
   */
  @Get('for-account')
  getForAccount(@Query('account_id') accountId: string, @Query('category') category?: string) {
    return this.service.getByAccountStr(accountId, category);
  }

  /**
   * GET /ews/loan-questions/for-dump/:dumpId?category=retail
   * Returns active questions + saved answers for an account (by dump numeric id)
   */
  @Get('for-dump/:dumpId')
  getForDump(@Param('dumpId') dumpId: string, @Query('category') category?: string) {
    return this.service.getForAccount(+dumpId, category);
  }

  /**
   * POST /ews/loan-questions/answers/:dumpId
   * Saves answers for a dump account
   */
  @Post('answers/:dumpId')
  saveAnswers(@Param('dumpId') dumpId: string, @Body() body: any) {
    return this.service.saveAnswers(+dumpId, body.answers, body.answered_by);
  }

  // ── CRUD routes (use :id wildcard) ───────────────────────────
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(+id); }

  @Post()
  create(@Body() data: any) { return this.service.create(data); }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any) { return this.service.update(+id, data); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(+id); }
}
