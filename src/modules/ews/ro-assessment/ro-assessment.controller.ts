import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { RoAssessmentService } from './ro-assessment.service';

@Controller('ews/ro-assessment')
export class RoAssessmentController {
  constructor(private readonly service: RoAssessmentService) {}

  @Get('watch-list/:id')
  findByWatchList(@Param('id', ParseIntPipe) id: number) {
    return this.service.findByWatchListId(id);
  }

  @Get('questionnaire')
  getQuestionnaire(
    @Query('watch_list_id', ParseIntPipe) watchListId: number,
    @Query('loan_type') loanType: string,
  ) {
    return this.service.getQuestionnaire(watchListId, loanType);
  }

  @Post('answer')
  saveAnswer(@Body() body: any) {
    return this.service.saveAnswer(body);
  }

  @Post('bulk-answers')
  saveBulkAnswers(
    @Body() body: { watch_list_id: number; answers: any[]; ro_user: string },
  ) {
    return this.service.saveBulkAnswers(
      body.watch_list_id,
      body.answers,
      body.ro_user,
    );
  }
}
