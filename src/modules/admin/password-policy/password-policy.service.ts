import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';
import { UpdatePasswordPolicyDto } from './dto/password-policy.dto';

@Injectable()
export class PasswordPolicyService {
  private readonly logger = new Logger(PasswordPolicyService.name);

  constructor(private readonly db: DatabaseService) {}

  async getPolicy() {
    const query = `SELECT * FROM password_policy WHERE deleted_at IS NULL ORDER BY id LIMIT 1`;
    const result = await this.db.query(query);
    return result.rows[0];
  }

  async updatePolicy(data: UpdatePasswordPolicyDto, adminId: number) {
    const existing = await this.getPolicy();

    if (existing) {
      const query = `
        UPDATE password_policy 
        SET min_length = $1, num_cnt = $2, uppercase_cnt = $3, 
            lowercase_cnt = $4, symbol_cnt = $5, admin_id = $6, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
      `;
      const values = [
        data.min_length,
        data.num_cnt,
        data.uppercase_cnt,
        data.lowercase_cnt,
        data.symbol_cnt,
        adminId,
        existing.id,
      ];
      await this.db.query(query, values);
    } else {
      const query = `
        INSERT INTO password_policy (
          min_length, num_cnt, uppercase_cnt, lowercase_cnt, symbol_cnt, admin_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;
      const values = [
        data.min_length,
        data.num_cnt,
        data.uppercase_cnt,
        data.lowercase_cnt,
        data.symbol_cnt,
        adminId,
      ];
      await this.db.query(query, values);
    }

    // Crucial: Reset password_policy flag for all active employees
    // Replicating legacy PHP logic: $this -> employeeModel::update(..., ['password_policy' => 1], ['where' => ''])
    const resetUsersQuery = `
      UPDATE employee_master 
      SET password_policy = 1 
      WHERE deleted_at IS NULL AND is_active = 1
    `;
    await this.db.query(resetUsersQuery);

    return this.getPolicy();
  }
}
