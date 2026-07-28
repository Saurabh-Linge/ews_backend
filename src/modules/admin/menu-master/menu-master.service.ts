import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class MenuMasterService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    return this.db.query(`
           SELECT 
    m.id,
    m.section_type_id,
    m.linked_table_id,
    m.name,
    a.name AS section_name,
    m.name AS menu_name,
    m.is_active
FROM menu_master m
LEFT JOIN audit_section_master a 
    ON m.section_type_id = a.id
WHERE m.deleted_at IS NULL
ORDER BY m.id DESC
      `);
  }

  async create(data: {
    section_type_id: number;
    name: string;
    linked_table_id: number;
    is_active: number;
    admin_id: number;
  }) {
    const existing = await this.db.query(
      `SELECT id 
             FROM menu_master 
             WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) 
             AND deleted_at IS NULL
             `,
      [data.name],
    );

    if (existing.rows.length) {
      throw new BadRequestException('Menu master already exists');
    }

    try {
      return await this.db.query(
        ` INSERT INTO menu_master (section_type_id, name, linked_table_id, is_active, admin_id)
              VALUES ($1, $2, $3, $4, $5)
              RETURNING *
              `,
        [
          data.section_type_id,
          data.name,
          data.linked_table_id,
          data.is_active,
          data.admin_id,
        ],
      );
    } catch (err: any) {
      if (err.code === '23505') {
        throw new BadRequestException('Menu master already exists');
      }
      throw err;
    }
  }

  async update(id: number, name: string) {
    const existing = await this.db.query(
      `SELECT id FROM menu_master 
       WHERE LOWER(name) = LOWER($1) 
       AND id != $2 AND deleted_at IS NULL`,
      [name, id],
    );

    if (existing.rows.length) {
      throw new BadRequestException('Menu master already exists');
    }

    return this.db.query(
      `
             UPDATE menu_master
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
            UPDATE menu_master
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
            UPDATE menu_master
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
      [id],
    );
  }
}
