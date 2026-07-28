import { Module } from '@nestjs/common';
import { BranchRatingService } from './risk-branch-rating.service';
import { BranchRatingController } from './risk-branch-rating.controller';

@Module({
  controllers: [BranchRatingController],
  providers: [BranchRatingService],
  exports: [BranchRatingService],
})
export class BranchRatingModule {}
