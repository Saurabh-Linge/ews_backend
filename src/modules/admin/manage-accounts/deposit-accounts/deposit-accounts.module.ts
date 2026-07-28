import { Module } from '@nestjs/common';
import { DepositAccountsService } from './deposit-accounts.service';
import { DepositAccountsController } from './deposit-accounts.controller';

@Module({
  controllers: [DepositAccountsController],
  providers: [DepositAccountsService],
})
export class DepositAccountsModule {}
