import { Controller, Get, Query, Patch, Param, Body } from '@nestjs/common';
import { AccountsService } from './accounts.service';

@Controller('ews/accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('branch') branch?: string,
    @Query('flagged') flagged?: string,
  ) {
    return this.service.findAll({
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '50', 10),
      search,
      branch,
      flagged,
    });
  }

  @Patch(':accountId')
  update(@Param('accountId') accountId: string, @Body() data: any) {
    return this.service.update(accountId, data);
  }
}
