import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../core/database/database.service';

@Injectable()
export class BranchesService {
  constructor(private db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query(
      'SELECT * FROM ews_branches ORDER BY name ASC',
    );
    return res.rows;
  }

  async findOne(id: number) {
    const res = await this.db.query(
      'SELECT * FROM ews_branches WHERE id = $1',
      [id],
    );
    return res.rows[0];
  }

  async create(data: any) {
    const res = await this.db.query(
      `INSERT INTO ews_branches (name, code, address, is_active) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.name, data.code, data.address, data.is_active ?? true],
    );
    return res.rows[0];
  }

  async update(id: number, data: any) {
    const res = await this.db.query(
      `UPDATE ews_branches SET name = $1, code = $2, address = $3, is_active = $4 WHERE id = $5 RETURNING *`,
      [data.name, data.code, data.address, data.is_active, id],
    );
    return res.rows[0];
  }

  async remove(id: number) {
    await this.db.query(`DELETE FROM ews_branches WHERE id = $1`, [id]);
    return { success: true };
  }
}
