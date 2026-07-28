import { Module } from '@nestjs/common';
import { PeriodwiseQuestionsMastersController } from './/periodwise-questions-master.controller';
import { PeriodwiseQuestionsMasterService } from './periodwise-questions-master.service';

@Module({
  controllers: [PeriodwiseQuestionsMastersController],
  providers: [PeriodwiseQuestionsMasterService],
})
export class PeriodwiseQuestionsMasterModule {}
