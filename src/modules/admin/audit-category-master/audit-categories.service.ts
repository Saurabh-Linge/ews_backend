import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../../../core/database/database.service';

import {
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateQuestionMappingDto,
} from './dto/audit-categories.dto';

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
export class AuditCategoryMasterService {
  constructor(private readonly db: DatabaseService) {}

  private async queryRows(query: string, params: any[] = []) {
    const result = await this.db.query(query, params);

    return result.rows;
  }

  private async queryOne(query: string, params: any[] = []) {
    const rows = await this.queryRows(query, params);

    return rows[0];
  }

  async getLookups() {
    try {
      const menus = await this.queryRows(
        `
                SELECT
                    id::int AS value,
                    name AS label,
                    linked_table_id
                FROM menu_master
                WHERE
                    deleted_at IS NULL
                    AND is_active = 1
                ORDER BY name
                `,
      );

      return {
        menus,
      };
    } catch (error) {
      throw new BadRequestException('Failed to load lookups');
    }
  }

  async findAll() {
    try {
      return this.queryRows(
        `
            SELECT

                cm.*,

                mm.name AS menu_name

            FROM category_master cm

            LEFT JOIN menu_master mm
                ON mm.id = cm.menu_id

            WHERE cm.deleted_at IS NULL

            ORDER BY cm.id DESC
            `,
      );
    } catch (error) {
      throw new BadRequestException('Failed to fetch categories');
    }
  }

  async findOne(id: number) {
    const row = await this.queryOne(
      `
                SELECT *
                FROM category_master
                WHERE
                    id = $1
                    AND deleted_at IS NULL
                `,
      [id],
    );

    if (!row) {
      throw new NotFoundException('Category not found');
    }

    return row;
  }

  async validateDuplicate(name: string, menuId: number, excludeId?: number) {
    let query = `
            SELECT id
            FROM category_master
            WHERE
                UPPER(name) = UPPER($1)
                AND menu_id = $2
                AND deleted_at IS NULL
        `;

    const params: any[] = [name, menuId];

    if (excludeId) {
      query += `
                AND id != $3
            `;

      params.push(excludeId);
    }

    const row = await this.queryOne(query, params);

    if (row) {
      throw new BadRequestException(
        'Category already exists for selected menu',
      );
    }
  }

  async create(data: CreateCategoryDto) {
    try {
      if (data.menu_id === 1) {
        throw new BadRequestException('This menu is restricted');
      }

      await this.validateDuplicate(data.name, data.menu_id);

      const menu = await this.queryOne(
        `
                SELECT linked_table_id
                FROM menu_master
                WHERE id = $1
                `,
        [data.menu_id],
      );

      if (!menu) {
        throw new BadRequestException('Invalid menu');
      }

      const row = await this.queryOne(
        `
                INSERT INTO category_master (

                    menu_id,
                    name,
                    linked_table_id,
                    question_set_ids,
                    is_cc_acc_category,
                    is_active,
                    admin_id

                )

                VALUES (

                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7

                )

                RETURNING *
                `,
        [
          data.menu_id,

          data.name.trim().toUpperCase(),

          menu.linked_table_id,

          data.question_set_ids ?? '',

          data.is_cc_acc_category ?? 0,

          data.is_active ?? 1,

          data.admin_id ?? 1,
        ],
      );

      return row;
    } catch (error) {
      throw error;
    }
  }

  async update(id: number, data: UpdateCategoryDto) {
    try {
      const existing = await this.findOne(id);

      const menuId = data.menu_id ?? existing.menu_id;

      const name = data.name ?? existing.name;

      await this.validateDuplicate(name, menuId, id);

      const menu = await this.queryOne(
        `
                SELECT linked_table_id
                FROM menu_master
                WHERE id = $1
                `,
        [menuId],
      );

      if (!menu) {
        throw new BadRequestException('Invalid menu');
      }

      const row = await this.queryOne(
        `
                UPDATE category_master

                SET

                    menu_id = $1,

                    name = $2,

                    linked_table_id = $3,

                    question_set_ids = $4,

                    is_cc_acc_category = $5,

                    is_active = $6,

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id = $7

                RETURNING *
                `,
        [
          menuId,

          name.trim().toUpperCase(),

          menu.linked_table_id,

          data.question_set_ids ?? existing.question_set_ids,

          data.is_cc_acc_category ?? existing.is_cc_acc_category,

          data.is_active ?? existing.is_active,

          id,
        ],
      );

      return row;
    } catch (error) {
      throw error;
    }
  }

  async toggleStatus(id: number) {
    try {
      const row = await this.findOne(id);

      return this.queryOne(
        `
            UPDATE category_master

            SET

                is_active =
                    CASE
                        WHEN is_active = 1
                            THEN 0
                        ELSE 1
                    END,

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = $1

            RETURNING *
            `,
        [id],
      );
    } catch (error) {
      throw error;
    }
  }

  async remove(id: number) {
    try {
      await this.findOne(id);

      return this.queryOne(
        `
            UPDATE category_master

            SET
                deleted_at =
                    CURRENT_TIMESTAMP

            WHERE id = $1

            RETURNING *
            `,
        [id],
      );
    } catch (error) {
      throw error;
    }
  }

  // Question Set Mapping

  async getQuestionMapping(id: number) {
    const category = await this.findOne(id);

    const questionSets = await this.queryRows(
      `
            SELECT

                id::int AS value,

                name AS label

            FROM question_set_master

            WHERE
                set_type_id = 1
                AND deleted_at IS NULL
                AND is_active = 1

            ORDER BY name
            `,
    );

    return {
      category,

      questionSets,
    };
  }

  async updateQuestionMapping(
    id: number,

    data: UpdateQuestionMappingDto,
  ) {
    await this.findOne(id);

    return this.queryOne(
      `
        UPDATE category_master

        SET

            question_set_ids = $1,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = $2

        RETURNING *
        `,
      [data.question_set_ids ?? '', id],
    );
  }
}
