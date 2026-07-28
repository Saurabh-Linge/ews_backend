import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import {
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';

import { DepositAccountsService } from './deposit-accounts.service';

import {
  CreateDepositAccountDto,
  UpdateDepositAccountDto,
  DepositAccountFilterDto,
} from './dto/deposit-accounts.dto';

@Controller('deposit-accounts')
export class DepositAccountsController {
  constructor(private readonly service: DepositAccountsService) {}

  @Get()
  findAll(
    @Query()
    filters: DepositAccountFilterDto,
  ) {
    return this.service.findAll(filters);
  }

  @Get('upload-dumps')
  async getUploadDumps() {
    return this.service.getUploadDumps();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body()
    data: CreateDepositAccountDto,
  ) {
    return this.service.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe)
    id: number,

    @Body()
    data: UpdateDepositAccountDto,
  ) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.service.remove(id);
  }

  @Post('validate-upload')
  async validateUpload(@Req() req: any, @Query() query: any) {
    const file = await req.file();

    const fields = file.fields;

    return this.service.validateUpload(
      file,

      {
        upload_date: query.upload_date || fields?.upload_date?.value,

        period_from: query.period_from || fields?.period_from?.value,

        period_to: query.period_to || fields?.period_to?.value,
      },
    );
  }

  @Post('add-dump')
  async addDump(
    @Body()
    body: any,
  ) {
    return this.service.addDump(body.uploadKey || body.rows);
  }
}
