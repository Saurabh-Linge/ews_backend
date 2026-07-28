import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { CbsUploadService } from './cbs-upload.service';

@Controller('ews/cbs-upload')
export class CbsUploadController {
  constructor(private readonly service: CbsUploadService) {}

  @Get('last')
  getLastUpload() {
    return this.service.getLastUpload();
  }

  @Get('raw-data')
  getRawData(
    @Query('account_id') accountId?: string,
    @Query('branch_code') branchCode?: string,
  ) {
    return this.service.getRawCbsData(accountId, branchCode);
  }

  @Get('raw-data/:accountId')
  getRawDataByAccount(@Param('accountId') accountId: string) {
    return this.service.getRawCbsDataByAccount(accountId);
  }

  @Get(':uploadId/results')
  getResults(@Param('uploadId', ParseIntPipe) uploadId: number) {
    return this.service.getUploadResults(uploadId);
  }

  @Post('process')
  processUpload(@Body() body: { rows: any[]; uploaded_by: string }) {
    return this.service.processUpload(body.rows, body.uploaded_by);
  }

  @Post('clear-data')
  clearData() {
    return this.service.clearLoanData();
  }
}
