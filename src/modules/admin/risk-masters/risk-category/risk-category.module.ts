import { Module } from '@nestjs/common';
import { RiskCategoryService } from './risk-category.service';
import { RiskCategoryController } from './risk-category.controller';

@Module({
  controllers: [RiskCategoryController],
  providers: [RiskCategoryService],
  exports: [RiskCategoryService],
})
export class RiskCategoryModule {}
