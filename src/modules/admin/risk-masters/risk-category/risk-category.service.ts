import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../../../../core/database/database.service';

import {
  CreateRiskCategoryDto,
  CreateRiskCategoryWeightDto,
  UpdateRiskCategoryDto,
} from './dto/risk-category.dto';

@Injectable()
export class RiskCategoryService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    try {
      const result = await this.db.query(
        `
        SELECT
          rcm.id,
          rcm.risk_category,
          rcm.is_active,
          rcm.created_at,
          -- rcw.risk_weight,
          COALESCE(

            STRING_AGG(

                CONCAT(
                ym.year,
                ' : ',
                rcw.risk_weight
                ),

                E'\n'

                ORDER BY ym.year
            ),

            '-'

            ) AS weight_summary

        FROM risk_category_master rcm

        LEFT JOIN risk_category_weights rcw ON rcw.risk_category_id = rcm.id

        LEFT JOIN year_master ym
            ON ym.id = rcw.year_id

        WHERE rcm.deleted_at IS NULL

        GROUP BY rcm.id

        ORDER BY rcm.id DESC
        `,
      );

      return result.rows;
    } catch (error) {
      throw new BadRequestException('Failed to fetch risk categories');
    }
  }

  async findOne(id: number) {
    try {
      const result = await this.db.query(
        `
        SELECT
          id,
          risk_category,
          is_active,
          created_at

        FROM risk_category_master

        WHERE id = $1
        AND deleted_at IS NULL
        `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Risk category not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async create(data: CreateRiskCategoryDto) {
    try {
      await this.validateDuplicate(data.risk_category);

      const result = await this.db.query(
        `
        INSERT INTO risk_category_master (
          risk_category,
          is_active,
          admin_id,
          risk_weight,
          risk_appetite_percent_from,
          risk_appetite_percent_to
        )

        VALUES ($1, $2, $3, 0, 0, 0)

        RETURNING *
        `,
        [data.risk_category.trim(), data.is_active ?? 1, data.admin_id ?? 1],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async update(
    id: number,

    data: UpdateRiskCategoryDto,
  ) {
    try {
      await this.findOne(id);

      if (data.risk_category) {
        await this.validateDuplicate(data.risk_category, id);
      }

      const result = await this.db.query(
        `
        UPDATE risk_category_master

        SET
          risk_category = COALESCE(
            $1,
            risk_category
          ),

          is_active = COALESCE(
            $2,
            is_active
          ),

          admin_id = COALESCE(
            $3,
            admin_id
          ),

          updated_at = CURRENT_TIMESTAMP

        WHERE id = $4

        RETURNING *
        `,
        [data.risk_category?.trim(), data.is_active, data.admin_id, id],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async toggleStatus(id: number) {
    try {
      const existing = await this.findOne(id);

      const result = await this.db.query(
        `
        UPDATE risk_category_master

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

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async remove(id: number) {
    try {
      await this.findOne(id);

      const result = await this.db.query(
        `
        UPDATE risk_category_master

        SET
          deleted_at = CURRENT_TIMESTAMP

        WHERE id = $1

        RETURNING *
        `,
        [id],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  private async validateDuplicate(
    riskCategory: string,

    id?: number,
  ) {
    const result = await this.db.query(
      `
      SELECT id

      FROM risk_category_master

      WHERE LOWER(TRIM(risk_category))
      =
      LOWER(TRIM($1))

      AND deleted_at IS NULL

      ${id ? 'AND id != $2' : ''}
      `,
      id ? [riskCategory, id] : [riskCategory],
    );

    if (result.rows.length) {
      throw new BadRequestException('Risk category already exists');
    }
  }

  // Risk Category Weights

  async getYears() {
    try {
      const result = await this.db.query(
        `
      SELECT
        id,
        year

      FROM year_master

      WHERE deleted_at IS NULL

      ORDER BY id DESC
      `,
      );

      return result.rows;
    } catch (error) {
      throw new BadRequestException('Failed to fetch years');
    }
  }

  async findAllWeights(riskCategoryId: number) {
    try {
      const result = await this.db.query(
        `
      SELECT

        rcw.id,

        rcw.year_id,

        ym.year,

        rcw.risk_weight,

        rcw.risk_appetite_percent,

        rcw.is_active,

        rcw.created_at

      FROM risk_category_weights rcw

      INNER JOIN year_master ym
        ON ym.id = rcw.year_id

      WHERE rcw.risk_category_id = $1

      AND rcw.deleted_at IS NULL

      ORDER BY rcw.id DESC
      `,
        [riskCategoryId],
      );

      return result.rows;
    } catch (error) {
      throw new BadRequestException('Failed to fetch risk category weights');
    }
  }

  async createWeight(data: CreateRiskCategoryWeightDto) {
    try {
      await this.validateWeightDuplicate(data.risk_category_id, data.year_id);

      const result = await this.db.query(
        `
      INSERT INTO risk_category_weights (

        risk_category_id,

        year_id,

        risk_weight,

        risk_appetite_percent,

        is_active,

        admin_id

      )

      VALUES ($1, $2, $3, $4, $5, $6)

      RETURNING *
      `,
        [
          data.risk_category_id,

          data.year_id,

          data.risk_weight,

          data.risk_appetite_percent,

          data.is_active ?? 1,

          data.admin_id ?? 1,
        ],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async updateWeight(
    id: number,

    data: CreateRiskCategoryWeightDto,
  ) {
    try {
      await this.validateWeightDuplicate(
        data.risk_category_id,

        data.year_id,

        id,
      );

      const result = await this.db.query(
        `
      UPDATE risk_category_weights

      SET

        year_id = $1,

        risk_weight = $2,

        risk_appetite_percent = $3,

        is_active = $4,

        admin_id = $5,

        updated_at = CURRENT_TIMESTAMP

      WHERE id = $6

      RETURNING *
      `,
        [
          data.year_id,

          data.risk_weight,

          data.risk_appetite_percent,

          data.is_active ?? 1,

          data.admin_id ?? 1,

          id,
        ],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Risk category weight not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async removeWeight(id: number) {
    try {
      const result = await this.db.query(
        `
      UPDATE risk_category_weights

      SET
        deleted_at = CURRENT_TIMESTAMP

      WHERE id = $1

      RETURNING *
      `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Risk category weight not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  private async validateWeightDuplicate(
    riskCategoryId: number,

    yearId: number,

    id?: number,
  ) {
    const result = await this.db.query(
      `
    SELECT id

    FROM risk_category_weights

    WHERE risk_category_id = $1

    AND year_id = $2

    AND deleted_at IS NULL

    ${id ? 'AND id != $3' : ''}
    `,
      id ? [riskCategoryId, yearId, id] : [riskCategoryId, yearId],
    );

    if (result.rows.length) {
      throw new BadRequestException('Weight already exists for selected year');
    }
  }
}
