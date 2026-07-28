import { Module } from '@nestjs/common';
import { MenuMasterService } from './menu-master.service';
import { MenuMastersController } from './menu-master.controller';

@Module({
  controllers: [MenuMastersController],
  providers: [MenuMasterService],
})
export class MenuMasterModule {}
