import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../../../../core/database/database.service';

import {
  CreateRiskControlDto,
  CreateRiskControlKeyAspectDto,
} from './dto/risk-control.dto';

@Injectable()
export class RiskControlService {
  constructor(private readonly db: DatabaseService) {}

  // MASTER

  async findAll() {
    try {
      const result = await this.db.query(
        `
        SELECT

          rcm.id,

          rcm.name,

          rcm.is_active,

          COALESCE(

            STRING_AGG(
              rcka.name,
              E'\n'
              ORDER BY rcka.id
            ),

            '-'

          ) AS key_aspect_summary

        FROM risk_control_master rcm

        LEFT JOIN risk_control_key_aspect rcka
          ON rcka.risk_control_id = rcm.id
          AND rcka.deleted_at IS NULL

        WHERE rcm.deleted_at IS NULL

        GROUP BY rcm.id

        ORDER BY rcm.id DESC
        `,
      );

      return result.rows;
    } catch (error) {
      throw new BadRequestException('Failed to fetch risk controls');
    }
  }

  async findOne(id: number) {
    try {
      const result = await this.db.query(
        `
        SELECT *

        FROM risk_control_master

        WHERE id = $1

        AND deleted_at IS NULL
        `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Risk control not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async create(data: CreateRiskControlDto) {
    try {
      await this.validateDuplicate(data.name);

      const result = await this.db.query(
        `
        INSERT INTO risk_control_master (

          name,

          is_active,

          admin_id

        )

        VALUES ($1, $2, $3)

        RETURNING *
        `,
        [data.name, data.is_active ?? 1, data.admin_id ?? 1],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async update(
    id: number,

    data: CreateRiskControlDto,
  ) {
    try {
      await this.validateDuplicate(data.name, id);

      const result = await this.db.query(
        `
        UPDATE risk_control_master

        SET

          name = $1,

          is_active = $2,

          admin_id = $3,

          updated_at = CURRENT_TIMESTAMP

        WHERE id = $4

        RETURNING *
        `,
        [data.name, data.is_active ?? 1, data.admin_id ?? 1, id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Risk control not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async toggleStatus(id: number) {
    try {
      const result = await this.db.query(
        `
        UPDATE risk_control_master

        SET

          is_active = CASE
            WHEN is_active = 1
            THEN 0
            ELSE 1
          END,

          updated_at = CURRENT_TIMESTAMP

        WHERE id = $1

        RETURNING *
        `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Risk control not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async remove(id: number) {
    try {
      const result = await this.db.query(
        `
        UPDATE risk_control_master

        SET
          deleted_at = CURRENT_TIMESTAMP

        WHERE id = $1

        RETURNING *
        `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Risk control not found');
      }

      await this.db.query(
        `
        UPDATE risk_control_key_aspect

        SET
          deleted_at = CURRENT_TIMESTAMP

        WHERE risk_control_id = $1
        `,
        [id],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // KEY ASPECTS

  async findAllKeyAspects(riskControlId: number) {
    try {
      const result = await this.db.query(
        `
        SELECT *

        FROM risk_control_key_aspect

        WHERE risk_control_id = $1

        AND deleted_at IS NULL

        ORDER BY id DESC
        `,
        [riskControlId],
      );

      return result.rows;
    } catch (error) {
      throw new BadRequestException('Failed to fetch key aspects');
    }
  }

  async createKeyAspect(data: CreateRiskControlKeyAspectDto) {
    try {
      await this.validateKeyAspectDuplicate(data.risk_control_id, data.name);

      const result = await this.db.query(
        `
        INSERT INTO risk_control_key_aspect (

          risk_control_id,

          name,

          is_active,

          admin_id

        )

        VALUES ($1, $2, $3, $4)

        RETURNING *
        `,
        [
          data.risk_control_id,

          data.name,

          data.is_active ?? 1,

          data.admin_id ?? 1,
        ],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async updateKeyAspect(
    id: number,

    data: CreateRiskControlKeyAspectDto,
  ) {
    try {
      await this.validateKeyAspectDuplicate(
        data.risk_control_id,

        data.name,

        id,
      );

      const result = await this.db.query(
        `
        UPDATE risk_control_key_aspect

        SET

          name = $1,

          is_active = $2,

          admin_id = $3,

          updated_at = CURRENT_TIMESTAMP

        WHERE id = $4

        RETURNING *
        `,
        [data.name, data.is_active ?? 1, data.admin_id ?? 1, id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Key aspect not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async removeKeyAspect(id: number) {
    try {
      const result = await this.db.query(
        `
        UPDATE risk_control_key_aspect

        SET
          deleted_at = CURRENT_TIMESTAMP

        WHERE id = $1

        RETURNING *
        `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Key aspect not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // =========================
  // VALIDATIONS
  // =========================

  private async validateDuplicate(name: string, id?: number) {
    const result = await this.db.query(
      `
      SELECT id

      FROM risk_control_master

      WHERE LOWER(TRIM(name))
        = LOWER(TRIM($1))

      AND deleted_at IS NULL

      ${id ? 'AND id != $2' : ''}
      `,
      id ? [name, id] : [name],
    );

    if (result.rows.length) {
      throw new BadRequestException('Risk control already exists');
    }
  }

  private async validateKeyAspectDuplicate(
    riskControlId: number,

    name: string,

    id?: number,
  ) {
    const result = await this.db.query(
      `
      SELECT id

      FROM risk_control_key_aspect

      WHERE risk_control_id = $1

      AND LOWER(TRIM(name))
        = LOWER(TRIM($2))

      AND deleted_at IS NULL

      ${id ? 'AND id != $3' : ''}
      `,
      id ? [riskControlId, name, id] : [riskControlId, name],
    );

    if (result.rows.length) {
      throw new BadRequestException('Key aspect already exists');
    }
  }
}
