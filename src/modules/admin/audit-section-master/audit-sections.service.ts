import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class AuditSectionService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    return this.db.query(`
            SELECT id, name, is_active
            FROM audit_section_master
            WHERE deleted_at IS NULL
            ORDER BY id DESC
      `);
  }

  async create(data: { name: string; admin_id: number }) {
    const existing = await this.db.query(
      `SELECT id 
             FROM audit_section_master 
             WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) 
             AND deleted_at IS NULL
             `,
      [data.name],
    );

    if (existing.rows.length) {
      throw new BadRequestException('Audit section alreay exists');
    }

    try {
      return await this.db.query(
        ` INSERT INTO audit_section_master (name, admin_id)
              VALUES ($1, $2)
              RETURNING *
              `,
        [data.name, data.admin_id],
      );
    } catch (err: any) {
      if (err.code === '23505') {
        throw new BadRequestException('Audit section already exists');
      }
      throw err;
    }
  }

  async update(id: number, name: string) {
    const existing = await this.db.query(
      `SELECT id FROM audit_section_master 
       WHERE LOWER(name) = LOWER($1) 
       AND id != $2 AND deleted_at IS NULL`,
      [name, id],
    );

    if (existing.rows.length) {
      throw new BadRequestException('Audit section already exists');
    }

    return this.db.query(
      `
             UPDATE audit_section_master
             SET name = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *
             `,
      [name, id],
    );
  }

  async toggleStatus(id: number) {
    return this.db.query(
      `
            UPDATE audit_section_master
            SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
            `,
      [id],
    );
  }

  async softDelete(id: number) {
    return this.db.query(
      `
            UPDATE audit_section_master
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
      [id],
    );
  }
}
