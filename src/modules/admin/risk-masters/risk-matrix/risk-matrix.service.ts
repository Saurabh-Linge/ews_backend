import { BadRequestException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../../core/database/database.service';

import { CreateRiskMatrixDto } from './dto/risk-matrix.dto';

@Injectable()
export class RiskMatrixService {
  constructor(private readonly db: DatabaseService) {}

  private getRiskParameterName(value: number) {
    switch (Number(value)) {
      case 1:
        return 'HIGH RISK';

      case 2:
        return 'MEDIUM RISK';

      case 3:
        return 'LOW RISK';

      case 4:
        return 'NO RISK';

      default:
        return '-';
    }
  }

  async findByYear(yearId: number) {
    try {
      const result = await this.db.query(
        `
        SELECT *

        FROM risk_matrix

        WHERE year_id = $1

        AND deleted_at IS NULL

        ORDER BY risk_parameter
        `,
        [yearId],
      );

      const rows = result.rows.map((row: any) => ({
        ...row,

        risk_parameter_name: this.getRiskParameterName(row.risk_parameter),
      }));

      // AUTO CREATE DEFAULT ROWS

      if (!rows.length) {
        return [
          {
            risk_parameter: 1,
            risk_parameter_name: 'HIGH RISK',

            business_risk_app: 1,

            business_risk_score: 0,

            control_risk_app: 1,

            control_risk_score: 0,

            residual_risk_app: 1,
          },

          {
            risk_parameter: 2,
            risk_parameter_name: 'MEDIUM RISK',

            business_risk_app: 1,

            business_risk_score: 0,

            control_risk_app: 1,

            control_risk_score: 0,

            residual_risk_app: 1,
          },

          {
            risk_parameter: 3,
            risk_parameter_name: 'LOW RISK',

            business_risk_app: 1,

            business_risk_score: 0,

            control_risk_app: 1,

            control_risk_score: 0,

            residual_risk_app: 1,
          },

          {
            risk_parameter: 4,
            risk_parameter_name: 'NO RISK',

            business_risk_app: 0,

            business_risk_score: 0,

            control_risk_app: 0,

            control_risk_score: 0,

            residual_risk_app: 0,
          },
        ];
      }

      return rows;
    } catch (error) {
      throw new BadRequestException('Failed to fetch risk matrix');
    }
  }

  async saveMatrix(
    yearId: number,

    data: CreateRiskMatrixDto,
  ) {
    try {
      return await this.db.transaction(async (client) => {
        // REMOVE OLD MATRIX

        await client.query(
          `
            UPDATE risk_matrix

            SET
              deleted_at = CURRENT_TIMESTAMP

            WHERE year_id = $1
            `,
          [yearId],
        );

        // INSERT NEW MATRIX

        for (const row of data.rows) {
          await client.query(
            `
              INSERT INTO risk_matrix (

                year_id,

                risk_parameter,

                business_risk_app,

                business_risk_score,

                control_risk_app,

                control_risk_score,

                residual_risk_app,

                admin_id

              )

              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8
              )
              `,
            [
              yearId,

              row.risk_parameter,

              row.business_risk_app,

              row.business_risk_score,

              row.control_risk_app,

              row.control_risk_score,

              row.residual_risk_app,

              1,
            ],
          );
        }

        return {
          message: 'Risk matrix updated successfully',
        };
      });
    } catch (error) {
      console.log(error);

      throw error;
    }
  }
}
