import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from 'src/core/database/database.service';

@Injectable()
export class BroaderAreaMasterService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    return this.db.query(`
           SELECT 
            id,
            name,
            appetite_percent,
            occurance_percent,
            magnitude,
            frequency,
            average_qualitative_count,
            average_quantitative_count
            FROM audit_area_master
            WHERE deleted_at IS NULL
            ORDER BY id DESC
      `);
  }

  async create(data: {
    name: string;
    appetite_percent: string;
    occurance_percent: string;
    magnitude: string;
    frequency: string;
    average_qualitative_count: string;
    average_quantitative_count: string;
    admin_id: number;
  }) {
    const existing = await this.db.query(
      `SELECT id 
             FROM audit_area_master 
             WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) 
             AND deleted_at IS NULL
             `,
      [data.name],
    );

    if (existing.rows.length) {
      throw new BadRequestException('Audit area master already exists');
    }

    try {
      return await this.db.query(
        ` INSERT INTO audit_area_master (name, appetite_percent, occurance_percent, magnitude, frequency, average_qualitative_count, average_quantitative_count, admin_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              RETURNING *
              `,
        [
          data.name,
          data.appetite_percent,
          data.occurance_percent,
          data.magnitude,
          data.frequency,
          data.average_qualitative_count,
          data.average_quantitative_count,
          data.admin_id,
        ],
      );
    } catch (err: any) {
      if (err.code === '23505') {
        throw new BadRequestException('Audit area master already exists');
      }
      throw err;
    }
  }

  async update(
    id: number,
    name: string,
    appetite_percent: string,
    occurance_percent: string,
    magnitude: string,
    frequency: string,
    average_qualitative_count: string,
    average_quantitative_count: string,
  ) {
    const existing = await this.db.query(
      `SELECT id FROM audit_area_master 
       WHERE LOWER(name) = LOWER($1) 
       AND id != $2 AND deleted_at IS NULL`,
      [name, id],
    );

    if (existing.rows.length) {
      throw new BadRequestException('Audit area master already exists');
    }

    return this.db.query(
      `
             UPDATE audit_area_master
             SET name = $1,appetite_percent = $2, occurance_percent = $3, magnitude = $4, frequency = $5, average_qualitative_count = $6, average_quantitative_count = $7, updated_at = CURRENT_TIMESTAMP
             WHERE id = $8
             RETURNING *
             `,
      [
        name,
        appetite_percent,
        occurance_percent,
        magnitude,
        frequency,
        average_qualitative_count,
        average_quantitative_count,
        id,
      ],
    );
  }

  async softDelete(id: number) {
    return this.db.query(
      `
            UPDATE audit_area_master SET deleted_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
      [id],
    );
  }
}
