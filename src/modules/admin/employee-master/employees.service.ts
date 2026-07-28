import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const query = `
      SELECT 
        id, emp_code, user_type_id, name, email, mobile, 
        designation, gender, is_active, audit_unit_authority, created_at
      FROM employee_master
      WHERE deleted_at IS NULL
      ORDER BY id DESC
    `;
    const result = await this.db.query(query);
    return result.rows;
  }

  async findOne(id: number) {
    const query = `
      SELECT *
      FROM employee_master
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await this.db.query(query, [id]);
    if (!result.rows[0]) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }
    return result.rows[0];
  }

  async create(data: CreateEmployeeDto) {
    let passwordHash = '';
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    } else {
      // Default password logic from PHP: 'Emp@' . date('Y')
      passwordHash = await bcrypt.hash('Emp@' + new Date().getFullYear(), 10);
    }

    const query = `
      INSERT INTO employee_master (
        emp_code, user_type_id, name, email, mobile, 
        designation, gender, password, is_active, 
        password_policy, audit_unit_authority, admin_id, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      RETURNING id, emp_code, name, email, is_active
    `;

    const values = [
      data.emp_code,
      data.user_type_id,
      data.name?.toUpperCase(),
      data.email,
      data.mobile,
      data.designation ?? '',
      data.gender,
      passwordHash,
      data.is_active ?? 1,
      1, // password_policy = 1 initially
      data.unit_ids
        ? data.unit_ids.join(',')
        : (data.audit_unit_authority ?? ''),
      data.admin_id ?? 1,
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async update(id: number, data: UpdateEmployeeDto) {
    // Check existence
    await this.findOne(id);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Helper to add updates dynamically
    const addUpdate = (field: string, value: any) => {
      if (value !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(value);
      }
    };

    addUpdate('emp_code', data.emp_code);
    addUpdate('user_type_id', data.user_type_id);
    addUpdate('name', data.name?.toUpperCase());
    addUpdate('email', data.email);
    addUpdate('mobile', data.mobile);
    addUpdate('designation', data.designation);
    addUpdate('gender', data.gender);
    addUpdate('is_active', data.is_active);

    if (data.unit_ids !== undefined) {
      addUpdate('audit_unit_authority', data.unit_ids.join(','));
    } else {
      addUpdate('audit_unit_authority', data.audit_unit_authority);
    }

    addUpdate('admin_id', data.admin_id ?? 1);

    if (data.password) {
      const hash = await bcrypt.hash(data.password, 10);
      addUpdate('password', hash);
      addUpdate('password_policy', 0); // reset policy if manually changed
    }

    if (updates.length === 0) {
      return this.findOne(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE employee_master 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, emp_code, name, email, is_active
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async remove(id: number) {
    // Check existence
    await this.findOne(id);

    // Soft delete logic to match PHP
    const query = `
      UPDATE employee_master 
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    await this.db.query(query, [id]);
    return { deleted: true };
  }

  async setPassword(id: number, password: string) {
    const hash = await bcrypt.hash(password, 10);
    const query = `
      UPDATE employee_master 
      SET password = $1, password_policy = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
    await this.db.query(query, [hash, id]);
    return { success: true };
  }

  async updateAuthority(id: number, unitIds: number[]) {
    this.logger.log(
      `Updating authority for employee ${id} with units: ${JSON.stringify(unitIds)}`,
    );
    // Legacy logic: store as comma separated string
    const authorityStr = (unitIds || []).join(',');
    const query = `
      UPDATE employee_master 
      SET audit_unit_authority = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
    await this.db.query(query, [authorityStr, id]);
    return { success: true };
  }
}
