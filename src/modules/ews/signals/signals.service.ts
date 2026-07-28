import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

export interface EwsSignal {
  id: number;
  number: number;
  name: string;
  category: string;
  default_risk: 'High' | 'Medium' | 'Low';
  weight: number;
  description: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(private readonly db: DatabaseService) {}

  async findAll(category?: string, enabled?: boolean) {
    let query = `
      SELECT id, number, name, category, default_risk, weight, description, enabled, created_at, updated_at
      FROM ews_signals
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (category) {
      query += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (enabled !== undefined) {
      query += ` AND enabled = $${idx++}`;
      params.push(enabled);
    }
    query += ' ORDER BY number ASC';

    const result = await this.db.query<EwsSignal>(query, params);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query<EwsSignal>(
      'SELECT * FROM ews_signals WHERE id = $1',
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException(`Signal ${id} not found`);
    return result.rows[0];
  }

  async findByNumber(num: number) {
    const result = await this.db.query<EwsSignal>(
      'SELECT * FROM ews_signals WHERE number = $1',
      [num],
    );
    return result.rows[0] || null;
  }

  async update(
    id: number,
    data: Partial<{
      name: string;
      weight: number;
      enabled: boolean;
      description: string;
    }>,
  ) {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.weight !== undefined) {
      updates.push(`weight = $${idx++}`);
      values.push(data.weight);
    }
    if (data.enabled !== undefined) {
      updates.push(`enabled = $${idx++}`);
      values.push(data.enabled);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(data.description);
    }

    if (updates.length === 0) return this.findOne(id);
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await this.db.query(
      `UPDATE ews_signals SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0];
  }

  async toggleAll(enabled: boolean) {
    await this.db.query(
      'UPDATE ews_signals SET enabled = $1, updated_at = CURRENT_TIMESTAMP',
      [enabled],
    );
    return { success: true, enabled };
  }

  async getCategories() {
    const result = await this.db.query(
      'SELECT DISTINCT category FROM ews_signals ORDER BY category',
    );
    return result.rows.map((r: any) => r.category);
  }
}
