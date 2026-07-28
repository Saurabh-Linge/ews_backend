import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Req,
  Delete,
} from '@nestjs/common';
import { BroaderAreaMasterService } from './broader-area-master.service';
import { CreateBroaderAreaMasterDto } from './dto/broader-area-master.dto';

@Controller('broader-area-masters')
export class BroaderAreaMastersController {
  constructor(private readonly service: BroaderAreaMasterService) {}

  @Get()
  getAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateBroaderAreaMasterDto, @Req() req: any) {
    const admin_id = req.user?.id || 1;
    return this.service.create({ ...dto, admin_id });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateBroaderAreaMasterDto) {
    return this.service.update(
      Number(id),
      dto.name,
      dto.appetite_percent,
      dto.occurance_percent,
      dto.magnitude,
      dto.frequency,
      dto.average_qualitative_count,
      dto.average_quantitative_count,
    );
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.softDelete(Number(id));
  }
}
