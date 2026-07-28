import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../../../../core/database/database.service';

import { CreateRiskCompositeDto } from './dto/risk-composite.dto';

@Injectable()
export class RiskCompositeService {
  constructor(private readonly db: DatabaseService) {}

  private getRiskLabel(value: number) {
    switch (Number(value)) {
      case 1:
        return 'HIGH';

      case 2:
        return 'MEDIUM';

      case 3:
        return 'LOW';

      default:
        return '-';
    }
  }

  async findAll() {
    try {
      const result = await this.db.query(
        `
        SELECT *

        FROM risk_composite

        WHERE deleted_at IS NULL

        ORDER BY id DESC
        `,
      );

      return result.rows.map((row: any) => ({
        ...row,

        business_risk_name: this.getRiskLabel(row.business_risk),

        control_risk_name: this.getRiskLabel(row.control_risk),
      }));
    } catch (error) {
      throw new BadRequestException('Failed to fetch composite risks');
    }
  }

  async findOne(id: number) {
    try {
      const result = await this.db.query(
        `
        SELECT *

        FROM risk_composite

        WHERE id = $1

        AND deleted_at IS NULL
        `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Composite risk not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async create(data: CreateRiskCompositeDto) {
    try {
      await this.validateDuplicate(data.business_risk, data.control_risk);

      const result = await this.db.query(
        `
        INSERT INTO risk_composite (

          business_risk,

          control_risk,

          name,

          admin_id

        )

        VALUES ($1, $2, $3, $4)

        RETURNING *
        `,
        [data.business_risk, data.control_risk, data.name, data.admin_id ?? 1],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async update(
    id: number,

    data: CreateRiskCompositeDto,
  ) {
    try {
      await this.validateDuplicate(
        data.business_risk,

        data.control_risk,

        id,
      );

      const result = await this.db.query(
        `
        UPDATE risk_composite

        SET

          business_risk = $1,

          control_risk = $2,

          name = $3,

          admin_id = $4,

          updated_at = CURRENT_TIMESTAMP

        WHERE id = $5

        RETURNING *
        `,
        [
          data.business_risk,

          data.control_risk,

          data.name,

          data.admin_id ?? 1,

          id,
        ],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Composite risk not found');
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
        UPDATE risk_composite

        SET
          deleted_at = CURRENT_TIMESTAMP

        WHERE id = $1

        RETURNING *
        `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Composite risk not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  private async validateDuplicate(
    businessRisk: number,

    controlRisk: number,

    id?: number,
  ) {
    const result = await this.db.query(
      `
      SELECT id

      FROM risk_composite

      WHERE business_risk = $1

      AND control_risk = $2

      AND deleted_at IS NULL

      ${id ? 'AND id != $3' : ''}
      `,
      id ? [businessRisk, controlRisk, id] : [businessRisk, controlRisk],
    );

    if (result.rows.length) {
      throw new BadRequestException('Composite risk already exists');
    }
  }
}
