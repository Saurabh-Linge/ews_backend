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
import { AuditSectionService } from './audit-sections.service';
import { CreateAuditSectionDto } from './dto/create-audit-sections.dto';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email?: string;
  };
}

@Controller('audit-sections')
export class AuditSectionsController {
  constructor(private readonly service: AuditSectionService) {}

  @Get()
  getAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateAuditSectionDto, @Req() req: AuthRequest) {
    const admin_id = req.user?.id || 1;
    return this.service.create({ ...dto, admin_id });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateAuditSectionDto) {
    return this.service.update(Number(id), dto.name);
  }

  @Put(':id/toggle-status')
  toggleStatus(@Param('id') id: string) {
    return this.service.toggleStatus(Number(id));
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.softDelete(Number(id));
  }
}
