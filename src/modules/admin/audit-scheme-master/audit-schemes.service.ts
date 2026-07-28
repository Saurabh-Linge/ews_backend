import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../../../core/database/database.service';

import { CreateAuditSchemeDto, UpdateSchemeDto } from './dto/audit-schemes.dto';

interface SchemeRow {
  id: number;
  scheme_type_id: number;
  category_id: number;
  scheme_code: string;
  name: string;
  is_active: number;
  admin_id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

@Injectable()
export class AuditSchemeMasterService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<SchemeRow[]> {
    return this.queryRows<SchemeRow>(
      `
      SELECT
        sm.*,
        cm.name AS category_name,
        CASE
          WHEN sm.scheme_type_id = 1 THEN 'Deposit'
          WHEN sm.scheme_type_id = 2 THEN 'Advances'
          ELSE '-'
        END AS scheme_type_name
      FROM scheme_master sm
      LEFT JOIN category_master cm
        ON cm.id = sm.category_id
      WHERE sm.deleted_at IS NULL
      ORDER BY sm.id DESC
      `,
    );
  }

  async findOne(id: number): Promise<SchemeRow> {
    const row = await this.queryOne<SchemeRow>(
      `
      SELECT *
      FROM scheme_master
      WHERE id = $1
      AND deleted_at IS NULL
      `,
      [id],
    );

    if (!row) {
      throw new NotFoundException('Scheme not found');
    }

    return row;
  }

  async create(data: CreateAuditSchemeDto): Promise<SchemeRow> {
    await this.validateScheme(data);

    const row = await this.queryOne<SchemeRow>(
      `
      INSERT INTO scheme_master (
        scheme_type_id,
        category_id,
        scheme_code,
        name,
        is_active,
        admin_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        data.scheme_type_id,
        data.category_id,
        data.scheme_code.toUpperCase(),
        data.name.toUpperCase(),
        data.is_active ?? 1,
        data.admin_id ?? 1,
      ],
    );

    if (!row) {
      throw new BadRequestException('Unable to create scheme');
    }

    return row;
  }

  async update(id: number, data: UpdateSchemeDto): Promise<SchemeRow> {
    await this.findOne(id);

    await this.validateScheme(data, id);

    const row = await this.queryOne<SchemeRow>(
      `
      UPDATE scheme_master
      SET
        scheme_type_id = COALESCE($2, scheme_type_id),
        category_id = COALESCE($3, category_id),
        scheme_code = COALESCE($4, scheme_code),
        name = COALESCE($5, name),
        is_active = COALESCE($6, is_active),
        admin_id = COALESCE($7, admin_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        data.scheme_type_id,
        data.category_id,
        data.scheme_code?.toUpperCase(),
        data.name?.toUpperCase(),
        data.is_active,
        data.admin_id,
      ],
    );

    if (!row) {
      throw new BadRequestException('Unable to update scheme');
    }

    return row;
  }

  async toggleStatus(id: number) {
    const scheme = await this.findOne(id);

    const row = await this.queryOne(
      `
      UPDATE scheme_master
      SET
        is_active = CASE
          WHEN is_active = 1 THEN 0
          ELSE 1
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id],
    );

    if (!row) {
      throw new BadRequestException('Unable to update status');
    }

    return row;
  }

  async softDelete(id: number) {
    await this.findOne(id);

    const row = await this.queryOne(
      `
      UPDATE scheme_master
      SET
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id],
    );

    if (!row) {
      throw new BadRequestException('Unable to delete scheme');
    }

    return row;
  }

  async getCategoriesBySchemeType(schemeTypeId: number) {
    const linkedTableId = schemeTypeId === 1 ? 1 : 2;

    return this.queryRows(
      `
      SELECT
        id,
        name
      FROM category_master
      WHERE linked_table_id = $1
      AND deleted_at IS NULL
      AND is_active = 1
      ORDER BY name ASC
      `,
      [linkedTableId],
    );
  }

  private async validateScheme(
    data: Partial<CreateAuditSchemeDto & UpdateSchemeDto>,
    id?: number,
  ) {
    if (data.scheme_type_id && ![1, 2].includes(data.scheme_type_id)) {
      throw new BadRequestException('Invalid scheme type');
    }

    if (data.scheme_code && data.scheme_type_id) {
      let query = `
        SELECT id
        FROM scheme_master
        WHERE scheme_type_id = $1
        AND scheme_code = $2
        AND deleted_at IS NULL
      `;

      const params: any[] = [
        data.scheme_type_id,
        data.scheme_code.toUpperCase(),
      ];

      if (id) {
        query += ` AND id != $3`;
        params.push(id);
      }

      const existing = await this.queryOne(query, params);

      if (existing) {
        throw new BadRequestException('Scheme code already exists');
      }
    }
  }

  private async queryRows<T>(query: string, params: any[] = []): Promise<T[]> {
    const result = await this.db.query(query, params);
    return result.rows as T[];
  }

  private async queryOne<T>(
    query: string,
    params: any[] = [],
  ): Promise<T | null> {
    const rows = await this.queryRows<T>(query, params);

    return rows[0] ?? null;
  }
}
