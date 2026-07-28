import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  SetPasswordDto,
  UpdateAuthorityDto,
} from './dto/employee.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Get()
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(id, updateEmployeeDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.remove(id);
  }

  @Patch(':id/status')
  async toggleStatus(@Param('id', ParseIntPipe) id: number) {
    const employee = await this.employeesService.findOne(id);
    const newStatus = employee.is_active === 1 ? 0 : 1;
    return this.employeesService.update(id, { is_active: newStatus });
  }

  @Patch(':id/password')
  setPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() setPasswordDto: SetPasswordDto,
  ) {
    return this.employeesService.setPassword(id, setPasswordDto.password);
  }

  @Patch(':id/authority')
  setAuthority(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    console.log('Authority Update Body:', body);
    return this.employeesService.updateAuthority(id, body.unit_ids);
  }
}
