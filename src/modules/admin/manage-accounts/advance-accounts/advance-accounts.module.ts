import { Module } from '@nestjs/common';
import { AdvanceAccountsService } from './advance-accounts.service';
import { AdvanceAccountsController } from './advance-accounts.controller';

@Module({
  controllers: [AdvanceAccountsController],
  providers: [AdvanceAccountsService],
})
export class AdvanceAccountsModule {}
