import { Module } from '@nestjs/common';
import { RoAssessmentService } from './ro-assessment.service';
import { RoAssessmentController } from './ro-assessment.controller';

@Module({
  controllers: [RoAssessmentController],
  providers: [RoAssessmentService],
  exports: [RoAssessmentService],
})
export class RoAssessmentModule {}
