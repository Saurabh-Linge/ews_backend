import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../core/database/database.service';

@Injectable()
export class UsersService {
  constructor(private db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query(`
      SELECT u.id, u.username, u.full_name, u.email, u.is_active, r.name as role, r.id as role_id,
        COALESCE(
          json_agg(json_build_object('id', b.id, 'name', b.name)) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) as branches
      FROM ews_users u
      JOIN ews_roles r ON u.role_id = r.id
      LEFT JOIN ews_user_branches ub ON u.id = ub.user_id
      LEFT JOIN ews_branches b ON ub.branch_id = b.id
      GROUP BY u.id, r.id
      ORDER BY u.id ASC
    `);
    return res.rows;
  }

  async findOne(id: number) {
    const res = await this.db.query(
      `
      SELECT u.id, u.username, u.full_name, u.email, u.is_active, r.name as role, r.id as role_id,
        COALESCE(
          json_agg(json_build_object('id', b.id, 'name', b.name)) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) as branches
      FROM ews_users u
      JOIN ews_roles r ON u.role_id = r.id
      LEFT JOIN ews_user_branches ub ON u.id = ub.user_id
      LEFT JOIN ews_branches b ON ub.branch_id = b.id
      WHERE u.id = $1
      GROUP BY u.id, r.id
    `,
      [id],
    );
    return res.rows[0];
  }

  async create(data: any) {
    return this.db.transaction(async (client) => {
      const userRes = await client.query(
        `INSERT INTO ews_users (username, password, full_name, email, role_id, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          data.username,
          data.password,
          data.full_name,
          data.email,
          data.role_id,
          data.is_active ?? true,
        ],
      );
      const userId = userRes.rows[0].id;

      if (data.branch_ids && Array.isArray(data.branch_ids)) {
        for (const branchId of data.branch_ids) {
          await client.query(
            `INSERT INTO ews_user_branches (user_id, branch_id) VALUES ($1, $2)`,
            [userId, branchId],
          );
        }
      }
      return this.findOne(userId);
    });
  }

  async update(id: number, data: any) {
    return this.db.transaction(async (client) => {
      await client.query(
        `UPDATE ews_users 
         SET username=$1, full_name=$2, email=$3, role_id=$4, is_active=$5 
         WHERE id=$6`,
        [
          data.username,
          data.full_name,
          data.email,
          data.role_id,
          data.is_active,
          id,
        ],
      );

      // Update password if provided
      if (data.password) {
        await client.query(`UPDATE ews_users SET password=$1 WHERE id=$2`, [
          data.password,
          id,
        ]);
      }

      // Re-assign branches
      if (data.branch_ids && Array.isArray(data.branch_ids)) {
        await client.query(`DELETE FROM ews_user_branches WHERE user_id=$1`, [
          id,
        ]);
        for (const branchId of data.branch_ids) {
          await client.query(
            `INSERT INTO ews_user_branches (user_id, branch_id) VALUES ($1, $2)`,
            [id, branchId],
          );
        }
      }

      return this.findOne(id);
    });
  }

  async remove(id: number) {
    await this.db.query(`DELETE FROM ews_users WHERE id = $1`, [id]);
    return { success: true };
  }
}
