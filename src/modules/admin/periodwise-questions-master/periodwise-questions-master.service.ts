import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class PeriodwiseQuestionsMasterService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    return this.db.query(`
          SELECT
    mlcm.id,
    mlcm.year_id,
    mlcm.section_type_id,
    mlcm.user_type_id,
    mlcm.audit_unit_id,
    mlcm.start_month_year,
    mlcm.end_month_year,
    mlcm.menu_ids,
    mlcm.cat_ids,
    mlcm.header_ids,
    mlcm.question_ids,
    mlcm.advances_scheme_ids,
    mlcm.deposits_scheme_ids,
    mlcm.admin_id,
    mlcm.created_at,
    mlcm.updated_at,
    ym.year,
    stm.name AS section_type_name,
    aum.name AS audit_unit_name,
    aum.audit_unit_code

FROM multi_level_control_master mlcm

LEFT JOIN year_master ym
    ON ym.id = mlcm.year_id

LEFT JOIN audit_section_master stm
    ON stm.id = mlcm.section_type_id

LEFT JOIN audit_unit_master aum
    ON aum.id = mlcm.audit_unit_id

WHERE mlcm.deleted_at IS NULL

ORDER BY mlcm.id DESC;
      `);
  }

  async findQuestionData(id: number) {
    return this.db.query(
      `
          SELECT

    mm.id AS menu_id,
    mm.name AS menu_name,

    cm.id AS category_id,
    cm.name AS category_name,

    qsm.id AS question_set_id,
    qsm.name AS question_set_name,

    qhm.id AS header_id,
    qhm.name AS header_name,

    q.questions

FROM multi_level_control_master mlcm



LEFT JOIN menu_master mm
    ON mm.id::text = ANY(
        string_to_array(
            mlcm.menu_ids,
            ','
        )
    )



LEFT JOIN category_master cm
    ON cm.id::text = ANY(
        string_to_array(
            mlcm.cat_ids,
            ','
        )
    )
   AND cm.menu_id = mm.id



LEFT JOIN question_set_master qsm
    ON qsm.id::text = ANY(
        string_to_array(
            cm.question_set_ids,
            ','
        )
    )



LEFT JOIN question_header_master qhm
    ON qhm.question_set_id = qsm.id



LEFT JOIN (

    SELECT

        qm.header_id,
        qm.set_id,

        json_agg(

            json_build_object(

                'question_id', qm.id,
                'question', qm.question

            )

            ORDER BY qm.id

        ) AS questions

    FROM question_master qm

    GROUP BY

        qm.header_id,
        qm.set_id

) q

    ON q.header_id = qhm.id
   AND q.set_id = qsm.id

WHERE mlcm.id = $1
AND mlcm.deleted_at IS NULL

ORDER BY

    mm.id,
    cm.id,
    qsm.id,
    qhm.id;
      `,
      [id],
    );
  }

  async create(data: {
    year_id: number;
    section_type_id: number;
    user_type_id: number;
    audit_unit_id: number;
    start_month_year: string;
    end_month_year: string;
    admin_id: number;
  }) {
    const existing = await this.db.query(
      `SELECT id 
             FROM multi_level_control_master 
             WHERE audit_unit_id = $1 AND start_month_year = $2 AND end_month_year = $3
             AND deleted_at IS NULL
             `,
      [data.audit_unit_id, data.start_month_year, data.end_month_year],
    );

    if (existing.rows.length) {
      throw new BadRequestException('Menu master already exists');
    }

    try {
      return await this.db.query(
        ` INSERT INTO multi_level_control_master (year_id, section_type_id, user_type_id, audit_unit_id, start_month_year, end_month_year, admin_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING *
              `,
        [
          data.year_id,
          data.section_type_id,
          data.user_type_id,
          data.audit_unit_id,
          data.start_month_year,
          data.end_month_year,
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

  async update(
    id: number,
    data: {
      year_id: number;
      section_type_id: number;
      user_type_id: number;
      audit_unit_id: number;
      start_month_year: string;
      end_month_year: string;
    },
  ) {
    const existing = await this.db.query(
      `SELECT id FROM multi_level_control_master 
       WHERE audit_unit_id = $1 AND start_month_year = $2 AND end_month_year = $3
       AND id != $4 AND deleted_at IS NULL`,
      [data.audit_unit_id, data.start_month_year, data.end_month_year, id],
    );

    if (existing.rows.length) {
      throw new BadRequestException('Menu master already exists');
    }

    return this.db.query(
      `
             UPDATE multi_level_control_master
             SET year_id = $1, section_type_id = $2, user_type_id = $3, audit_unit_id = $4, start_month_year = $5, end_month_year = $6, updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
             RETURNING *
             `,
      [
        data.year_id,
        data.section_type_id,
        data.user_type_id,
        data.audit_unit_id,
        data.start_month_year,
        data.end_month_year,
        id,
      ],
    );
  }

  async updateAdvaneSchemes(id: number, data: { advances_scheme_ids: string }) {
    return this.db.query(
      `
             UPDATE multi_level_control_master
             SET advances_scheme_ids = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *
             `,
      [data.advances_scheme_ids, id],
    );
  }

  async updateDepositSchemes(
    id: number,
    data: { deposits_scheme_ids: string },
  ) {
    return this.db.query(
      `
             UPDATE multi_level_control_master
             SET deposits_scheme_ids = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *
             `,
      [data.deposits_scheme_ids, id],
    );
  }

  async updateMenu(id: number, data: { menu_ids: string }) {
    return this.db.query(
      `
             UPDATE multi_level_control_master
             SET menu_ids = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *
             `,
      [data.menu_ids, id],
    );
  }
  async updateCategory(id: number, data: { cat_ids: string }) {
    return this.db.query(
      `
             UPDATE multi_level_control_master
             SET cat_ids = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *
             `,
      [data.cat_ids, id],
    );
  }
  async updateQuestionAndHeaders(
    id: number,
    data: { header_ids: string; question_ids: string },
  ) {
    return this.db.query(
      `
             UPDATE multi_level_control_master
             SET header_ids = $1, question_ids = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING *
             `,
      [data.header_ids, data.question_ids, id],
    );
  }

  async softDelete(id: number) {
    return this.db.query(
      `
            UPDATE multi_level_control_master
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
      [id],
    );
  }
}
