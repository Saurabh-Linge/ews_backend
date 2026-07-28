import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { SignalsService } from './signals.service';

@Controller('ews/signals')
export class SignalsController {
  constructor(private readonly service: SignalsService) {}

  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('enabled') enabled?: string,
  ) {
    const enabledBool = enabled !== undefined ? enabled === 'true' : undefined;
    return this.service.findAll(category, enabledBool);
  }

  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch('toggle-all')
  toggleAll(@Body('enabled') enabled: boolean) {
    return this.service.toggleAll(enabled);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.update(id, body);
  }
}
