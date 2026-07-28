import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../core/database/database.service';

@Injectable()
export class RolesService {
  constructor(private db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query('SELECT * FROM ews_roles ORDER BY id ASC');
    return res.rows;
  }

  async findOne(id: number) {
    const res = await this.db.query('SELECT * FROM ews_roles WHERE id = $1', [
      id,
    ]);
    return res.rows[0];
  }

  async create(data: any) {
    const res = await this.db.query(
      `INSERT INTO ews_roles (name, description) VALUES ($1, $2) RETURNING *`,
      [data.name, data.description],
    );
    return res.rows[0];
  }

  async update(id: number, data: any) {
    const res = await this.db.query(
      `UPDATE ews_roles SET name = $1, description = $2 WHERE id = $3 RETURNING *`,
      [data.name, data.description, id],
    );
    return res.rows[0];
  }

  async remove(id: number) {
    await this.db.query(`DELETE FROM ews_roles WHERE id = $1`, [id]);
    return { success: true };
  }
}
