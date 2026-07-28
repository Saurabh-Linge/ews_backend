import { Module } from '@nestjs/common';
import { BroaderAreaMasterService } from './broader-area-master.service';
import { BroaderAreaMastersController } from './broader-area-master.controller';

@Module({
  controllers: [BroaderAreaMastersController],
  providers: [BroaderAreaMasterService],
})
export class BroaderAreaMasterModule {}
