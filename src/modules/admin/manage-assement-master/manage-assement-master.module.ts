import { Module } from '@nestjs/common';
import { ManageAssementMastersController } from './manage-assement-master.controller';
import { ManageAssementMasterService } from './manage-assement-master.service';

@Module({
  controllers: [ManageAssementMastersController],
  providers: [ManageAssementMasterService],
})
export class ManageAssementMasterModule {}
