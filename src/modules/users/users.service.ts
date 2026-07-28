import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { IdService } from '../../core/id/id.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly idService: IdService,
  ) {}

  async findAll() {
    const query = `
      SELECT 
        u.id, u.username, u.full_name, u.email, u.mobile_number, 
        u.role_id, r.role_name, 
        u.branch_id, b.branch_name,
        u.is_active, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN branches b ON u.branch_id = b.id
      ORDER BY u.created_at DESC
    `;
    const result = await this.db.query(query);
    return result.rows;
  }

  async findOne(id: string) {
    const query = `
      SELECT u.*, r.role_name, b.branch_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.id = $1
    `;
    const result = await this.db.query(query, [id]);
    return result.rows[0];
  }

  async findByUsername(username: string) {
    const query = `SELECT * FROM employee_master WHERE emp_code = $1 AND is_active = 1 AND deleted_at IS NULL`;
    const result = await this.db.query(query, [username]);
    return result.rows[0];
  }

  async create(data: CreateUserDto) {
    const id = this.idService.generate();

    let passwordHash = '';
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    } else {
      // Default password if not provided
      passwordHash = await bcrypt.hash('123456', 10);
    }

    const query = `
      INSERT INTO users (
        id, username, password_hash, full_name, email, 
        mobile_number, role_id, branch_id, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, username, full_name, role_id, branch_id, is_active
    `;
    const values = [
      id,
      data.username,
      passwordHash,
      data.full_name,
      data.email ?? null,
      data.mobile_number ?? null,
      data.role_id ?? null,
      data.branch_id ?? null,
      data.is_active ?? true,
    ];
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async update(id: string, data: UpdateUserDto) {
    let passwordFragment = '';
    const values: any[] = [id];
    let paramIndex = 2;

    if (data.password) {
      const hash = await bcrypt.hash(data.password, 10);
      passwordFragment = `, password_hash = $${paramIndex++}`;
      values.push(hash);
    }

    const query = `
      UPDATE users SET
        username = COALESCE($${paramIndex++}, username),
        full_name = COALESCE($${paramIndex++}, full_name),
        email = COALESCE($${paramIndex++}, email),
        mobile_number = COALESCE($${paramIndex++}, mobile_number),
        role_id = COALESCE($${paramIndex++}, role_id),
        branch_id = COALESCE($${paramIndex++}, branch_id),
        is_active = COALESCE($${paramIndex++}, is_active),
        updated_at = CURRENT_TIMESTAMP
        ${passwordFragment}
      WHERE id = $1
      RETURNING id, username, full_name, role_id, branch_id, is_active
    `;

    values.push(
      data.username ?? null,
      data.full_name ?? null,
      data.email ?? null,
      data.mobile_number ?? null,
      data.role_id ?? null,
      data.branch_id ?? null,
      data.is_active ?? null,
    );

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async remove(id: string) {
    const query = `DELETE FROM users WHERE id = $1`;
    await this.db.query(query, [id]);
    return { deleted: true };
  }
}
