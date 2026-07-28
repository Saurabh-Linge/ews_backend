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

import { AdvanceAccountsService } from './advance-accounts.service';

import {
  CreateAdvanceAccountDto,
  AdvanceAccountFilterDto,
  UpdateAdvanceAccountDto,
} from './dto/advance-accounts.dto';

@Controller('advance-accounts')
export class AdvanceAccountsController {
  constructor(private readonly service: AdvanceAccountsService) {}

  @Get()
  findAll(
    @Query()
    filters: AdvanceAccountFilterDto,
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
    data: CreateAdvanceAccountDto,
  ) {
    return this.service.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe)
    id: number,

    @Body()
    data: UpdateAdvanceAccountDto,
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
