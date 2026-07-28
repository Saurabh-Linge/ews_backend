import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../../../../core/database/database.service';

import { CreateBranchRatingDto } from './dto/risk-branch-rating.dto';

@Injectable()
export class BranchRatingService {
  constructor(private readonly db: DatabaseService) {}

  private getAuditTypeName(value: number) {
    switch (Number(value)) {
      case 1:
        return 'RBI Audit';

      case 2:
        return 'Concurrent Audit';

      default:
        return '-';
    }
  }

  async findByYear(yearId: number) {
    try {
      const result = await this.db.query(
        `
        SELECT

          MIN(rbr.id) as id,

          rbr.year_id,

          ym.year,

          rbr.audit_unit_id,

          aum.name as audit_unit_name,

          rbr.audit_type_id

          -- MIN(rbr.is_active) as is_active

        FROM risk_branch_rating rbr

        INNER JOIN year_master ym
          ON ym.id = rbr.year_id

        INNER JOIN audit_unit_master aum
          ON aum.id = rbr.audit_unit_id

        WHERE rbr.year_id = $1

        AND rbr.deleted_at IS NULL

        GROUP BY

          rbr.year_id,

          ym.year,

          rbr.audit_unit_id,

          aum.name,

          rbr.audit_type_id

        ORDER BY id DESC
        `,
        [yearId],
      );

      return result.rows.map((row: any) => ({
        ...row,

        audit_type_name: this.getAuditTypeName(row.audit_type_id),
      }));
    } catch (error) {
      throw new BadRequestException('Failed to fetch branch ratings');
    }
  }

  async findOne(id: number) {
    try {
      const rowResult = await this.db.query(
        `
          SELECT *

          FROM risk_branch_rating

          WHERE id = $1

          AND deleted_at IS NULL
          `,
        [id],
      );

      if (!rowResult.rows.length) {
        throw new NotFoundException('Branch rating not found');
      }

      const row = rowResult.rows[0];

      const result = await this.db.query(
        `
          SELECT *

          FROM risk_branch_rating

          WHERE year_id = $1

          AND audit_unit_id = $2

          AND audit_type_id = $3

          AND deleted_at IS NULL
          `,
        [row.year_id, row.audit_unit_id, row.audit_type_id],
      );

      const grouped: any = {
        id: row.id,

        year_id: row.year_id,

        audit_unit_id: row.audit_unit_id,

        audit_type_id: row.audit_type_id,

        is_active: row.is_active,
      };

      result.rows.forEach((item: any) => {
        switch (Number(item.risk_type_id)) {
          case 1:
            grouped.high_range_from = item.range_from;

            grouped.high_range_to = item.range_to;

            break;

          case 2:
            grouped.medium_range_from = item.range_from;

            grouped.medium_range_to = item.range_to;

            break;

          case 3:
            grouped.low_range_from = item.range_from;

            grouped.low_range_to = item.range_to;

            break;
        }
      });

      return grouped;
    } catch (error) {
      throw error;
    }
  }

  async create(data: CreateBranchRatingDto) {
    try {
      await this.validateDuplicate(data);

      return await this.db.transaction(async (client) => {
        // HIGH

        await client.query(
          `
            INSERT INTO risk_branch_rating (

              audit_type_id,

              year_id,

              audit_unit_id,

              risk_type_id,

              range_from,

              range_to,

              admin_id

            )

            VALUES (
              $1,$2,$3,$4,$5,$6,$7
            )
            `,
          [
            data.audit_type_id,

            data.year_id,

            data.audit_unit_id,

            1,

            data.high_range_from,

            data.high_range_to,

            // data.is_active ?? 1,

            data.admin_id ?? 1,
          ],
        );

        // MEDIUM

        await client.query(
          `
            INSERT INTO risk_branch_rating (

              audit_type_id,

              year_id,

              audit_unit_id,

              risk_type_id,

              range_from,

              range_to,

              admin_id

            )

            VALUES (
              $1,$2,$3,$4,$5,$6,$7
            )
            `,
          [
            data.audit_type_id,

            data.year_id,

            data.audit_unit_id,

            2,

            data.medium_range_from,

            data.medium_range_to,

            // data.is_active ?? 1,

            data.admin_id ?? 1,
          ],
        );

        // LOW

        await client.query(
          `
            INSERT INTO risk_branch_rating (

              audit_type_id,

              year_id,

              audit_unit_id,

              risk_type_id,

              range_from,

              range_to,

              admin_id

            )

            VALUES (
              $1,$2,$3,$4,$5,$6,$7
            )
            `,
          [
            data.audit_type_id,

            data.year_id,

            data.audit_unit_id,

            3,

            data.low_range_from,

            data.low_range_to,

            // data.is_active ?? 1,

            data.admin_id ?? 1,
          ],
        );

        return {
          message: 'Branch rating created successfully',
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async update(
    id: number,

    data: CreateBranchRatingDto,
  ) {
    try {
      const existing = await this.findOne(id);

      await this.validateDuplicate(data, existing.id);

      return await this.db.transaction(async (client) => {
        await client.query(
          `
            UPDATE risk_branch_rating

            SET
              deleted_at = CURRENT_TIMESTAMP

            WHERE year_id = $1

            AND audit_unit_id = $2

            AND audit_type_id = $3
            `,
          [existing.year_id, existing.audit_unit_id, existing.audit_type_id],
        );

        await this.create({
          ...data,
        });

        return {
          message: 'Branch rating updated successfully',
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async toggleStatus(id: number) {
    try {
      const existing = await this.findOne(id);

      const newStatus = Number(existing.is_active) === 1 ? 0 : 1;

      await this.db.query(
        `
        UPDATE risk_branch_rating

        SET
          is_active = $1,
          updated_at = CURRENT_TIMESTAMP

        WHERE year_id = $2

        AND audit_unit_id = $3

        AND audit_type_id = $4
        `,
        [
          newStatus,

          existing.year_id,

          existing.audit_unit_id,

          existing.audit_type_id,
        ],
      );

      return {
        message: 'Status updated successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  async remove(id: number) {
    try {
      const existing = await this.findOne(id);

      await this.db.query(
        `
        UPDATE risk_branch_rating

        SET
          deleted_at = CURRENT_TIMESTAMP

        WHERE year_id = $1

        AND audit_unit_id = $2

        AND audit_type_id = $3
        `,
        [existing.year_id, existing.audit_unit_id, existing.audit_type_id],
      );

      return {
        message: 'Branch rating deleted successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  private async validateDuplicate(
    data: CreateBranchRatingDto,

    id?: number,
  ) {
    const result = await this.db.query(
      `
        SELECT id

        FROM risk_branch_rating

        WHERE year_id = $1

        AND audit_unit_id = $2

        AND audit_type_id = $3

        AND deleted_at IS NULL
        `,
      [data.year_id, data.audit_unit_id, data.audit_type_id],
    );

    if (result.rows.length && !id) {
      throw new BadRequestException('Branch rating already exists');
    }
  }
}
