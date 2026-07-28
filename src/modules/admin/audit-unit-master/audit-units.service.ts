import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';
import {
  CreateAuditUnitDto,
  CreateTargetDto,
  UpdateAuditUnitDto,
  UpdateTargetDto,
} from './dto/audit-unit.dto';

interface AuditUnitRow {
  id: number;
  audit_unit_code: string;
  section_type_id: number;
  name: string;
  branch_head_id: number;
  branch_subhead_id: number | null;
  last_audit_date?: string;
  frequency?: number | null;
  is_active?: number;
  section_name?: string;
  branch_head_name?: string;
  branch_head_code?: string;
  branch_subhead_name?: string;
  branch_subhead_code?: string;
}

interface AuditSectionLookupRow {
  id: number;
  name: string;
}

interface EmployeeLookupRow {
  id: number;
  name: string;
  emp_code: string;
  combined_name: string;
}

interface AuditUnitLookupRow {
  id: number;
  name: string;
  audit_unit_code: string;
  combined_name: string;
  section_type_id: number;
}

interface FrequencyOption {
  label: string;
  value: number;
}

type AuditUnitValidationInput = Partial<
  CreateAuditUnitDto & UpdateAuditUnitDto
>;

@Injectable()
export class AuditUnitsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<AuditUnitRow[]> {
    return this.queryRows<AuditUnitRow>(`
      SELECT
        au.id,
        au.audit_unit_code,
        au.section_type_id,
        au.name,
        au.branch_head_id,
        au.branch_subhead_id,
        au.last_audit_date,
        au.frequency,
        au.is_active,
        sec.name AS section_name,
        head.name AS branch_head_name,
        head.emp_code AS branch_head_code,
        subhead.name AS branch_subhead_name,
        subhead.emp_code AS branch_subhead_code
      FROM audit_unit_master au
      LEFT JOIN audit_section_master sec ON sec.id = au.section_type_id
      LEFT JOIN employee_master head ON head.id = au.branch_head_id
      LEFT JOIN employee_master subhead ON subhead.id = au.branch_subhead_id
      WHERE au.deleted_at IS NULL
      ORDER BY au.id DESC
    `);
  }

  async findOne(id: number): Promise<AuditUnitRow> {
    const row = await this.queryOne<AuditUnitRow>(
      `
      SELECT *
      FROM audit_unit_master
      WHERE id = $1 AND deleted_at IS NULL
      `,
      [id],
    );

    if (!row) {
      throw new NotFoundException('Audit unit not found');
    }

    return row;
  }

  async getLookups(): Promise<{
    sections: AuditSectionLookupRow[];
    employees: EmployeeLookupRow[];
    units: AuditUnitLookupRow[];
    frequencies: FrequencyOption[];
  }> {
    const sections = await this.queryRows<AuditSectionLookupRow>(`
      SELECT id, name
      FROM audit_section_master
      WHERE is_active = 1 AND deleted_at IS NULL
      ORDER BY name ASC
    `);

    const employees = await this.queryRows<EmployeeLookupRow>(`
      SELECT
        id,
        name,
        emp_code,
        CONCAT(name, ' - ( EMP : ', emp_code, ' )') AS combined_name
      FROM employee_master
      WHERE user_type_id = 3 AND is_active = 1 AND deleted_at IS NULL
      ORDER BY name ASC
    `);

    const units = await this.queryRows<AuditUnitLookupRow>(`
      SELECT
        id,
        name,
        audit_unit_code,
        CONCAT(name, ' - ( BR. ', audit_unit_code, ' )') AS combined_name,
        section_type_id
      FROM audit_unit_master
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `);

    return {
      sections,
      employees,
      units,
      frequencies: this.getFrequencyOptions(),
    };
  }

  async create(data: CreateAuditUnitDto): Promise<AuditUnitRow> {
    await this.validateAuditUnit(data);

    try {
      const row = await this.queryOne<AuditUnitRow>(
        `
        INSERT INTO audit_unit_master (
          section_type_id,
          audit_unit_code,
          name,
          branch_head_id,
          branch_subhead_id,
          frequency,
          last_audit_date,
          admin_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          data.section_type_id,
          data.audit_unit_code,
          data.name.toUpperCase(),
          data.branch_head_id,
          data.branch_subhead_id ?? null,
          data.frequency,
          data.last_audit_date,
          data.admin_id ?? 1,
        ],
      );

      if (!row) {
        throw new BadRequestException('Unable to create audit unit');
      }

      return row;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException('Unable to create audit unit');
    }
  }

  async update(id: number, data: UpdateAuditUnitDto): Promise<AuditUnitRow> {
    await this.findOne(id);
    await this.validateAuditUnit(data, id);

    try {
      const row = await this.queryOne<AuditUnitRow>(
        `
        UPDATE audit_unit_master
        SET
          section_type_id = COALESCE($2, section_type_id),
          audit_unit_code = COALESCE($3, audit_unit_code),
          name = COALESCE($4, name),
          branch_head_id = COALESCE($5, branch_head_id),
          branch_subhead_id = COALESCE($6, branch_subhead_id),
          frequency = COALESCE($7, frequency),
          is_active = COALESCE($8, is_active),
          admin_id = COALESCE($9, admin_id),
          last_audit_date = COALESCE($10, last_audit_date),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          data.section_type_id ?? null,
          data.audit_unit_code ?? null,
          data.name ? data.name.toUpperCase() : null,
          data.branch_head_id ?? null,
          data.branch_subhead_id ?? null,
          data.frequency ?? null,
          data.is_active ?? null,
          data.admin_id ?? 1,
          data.last_audit_date ?? null,
        ],
      );

      if (!row) {
        throw new NotFoundException('Audit unit not found');
      }

      return row;
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      throw new BadRequestException('Unable to update audit unit');
    }
  }

  async toggleStatus(id: number): Promise<AuditUnitRow> {
    await this.findOne(id);

    try {
      const row = await this.queryOne<AuditUnitRow>(
        `
        UPDATE audit_unit_master
        SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
        `,
        [id],
      );

      if (!row) {
        throw new NotFoundException('Audit unit not found');
      }

      return row;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw new BadRequestException('Unable to update audit unit status');
    }
  }

  async softDelete(id: number): Promise<{ deleted: boolean }> {
    await this.findOne(id);

    try {
      await this.execute(
        `
        UPDATE audit_unit_master
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [id],
      );

      return { deleted: true };
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw new BadRequestException('Unable to delete audit unit');
    }
  }

  async findFrequencies(): Promise<AuditUnitRow[]> {
    return this.queryRows<AuditUnitRow>(`
      SELECT id, audit_unit_code, name, frequency
      FROM audit_unit_master
      WHERE is_active = 1
        AND deleted_at IS NULL
        AND COALESCE(frequency, 0) != 0
      ORDER BY name ASC
    `);
  }

  async updateFrequency(
    id: number,
    frequency: number,
    adminId = 1,
  ): Promise<AuditUnitRow> {
    if (![1, 3, 6, 12].includes(frequency)) {
      throw new BadRequestException('Invalid audit frequency');
    }

    await this.findOne(id);

    try {
      const row = await this.queryOne<AuditUnitRow>(
        `
        UPDATE audit_unit_master
        SET frequency = $1,
            admin_id = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
          AND is_active = 1
          AND deleted_at IS NULL
        RETURNING *
        `,
        [frequency, adminId, id],
      );

      if (!row) {
        throw new NotFoundException('Active audit unit not found');
      }

      return row;
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      throw new BadRequestException('Unable to update audit frequency');
    }
  }

  getFrequencyOptions(): FrequencyOption[] {
    return [
      { label: '1 Month Frequency', value: 1 },
      { label: '3 Months Frequency', value: 3 },
      { label: '6 Months Frequency', value: 6 },
      { label: '12 Months Frequency', value: 12 },
    ];
  }

  private async validateAuditUnit(
    data: AuditUnitValidationInput,
    id?: number,
  ): Promise<void> {
    if (
      data.branch_head_id &&
      data.branch_subhead_id &&
      data.branch_head_id === data.branch_subhead_id
    ) {
      throw new BadRequestException(
        'Head and assistant cannot be same employee',
      );
    }

    if (data.audit_unit_code) {
      const existingCode = await this.queryRows<{ id: number }>(
        `
        SELECT id
        FROM audit_unit_master
        WHERE LOWER(TRIM(audit_unit_code)) = LOWER(TRIM($1))
          AND deleted_at IS NULL
          AND ($2::int IS NULL OR id != $2)
        `,
        [data.audit_unit_code, id ?? null],
      );

      if (existingCode.length) {
        throw new BadRequestException('Audit unit code already exists');
      }
    }

    if (data.section_type_id && data.section_type_id !== 1) {
      const existingSection = await this.queryRows<{ id: number }>(
        `
        SELECT id
        FROM audit_unit_master
        WHERE section_type_id = $1
          AND deleted_at IS NULL
          AND ($2::int IS NULL OR id != $2)
        `,
        [data.section_type_id, id ?? null],
      );

      if (existingSection.length) {
        throw new BadRequestException(
          'Audit section already assigned to another unit',
        );
      }
    }
  }

  private async queryRows<T>(query: string, params?: unknown[]): Promise<T[]> {
    const result = (await this.db.query(query, params as any[])) as unknown as {
      rows: T[];
    };
    return result.rows;
  }

  private async queryOne<T>(
    query: string,
    params?: unknown[],
  ): Promise<T | null> {
    const rows = await this.queryRows<T>(query, params);
    return rows[0] ?? null;
  }

  private async execute(query: string, params?: unknown[]): Promise<void> {
    await this.db.query(query, params as any[]);
  }

  async createTarget(data: CreateTargetDto) {
    await this.validateTarget(data);

    const row = await this.queryOne(
      `
    INSERT INTO target_details (
      year_id,
      audit_unit_id,
      deposit_target,
      advances_target,
      npa_target,
      admin_id
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
      [
        data.year_id,
        data.audit_unit_id,
        data.deposit_target,
        data.advances_target,
        data.npa_target,
        data.admin_id ?? 1,
      ],
    );

    if (!row) throw new BadRequestException('Unable to create target');

    return row;
  }

  async findTarget(id: number) {
    const row = await this.queryOne(
      `
    SELECT *
    FROM target_details
    WHERE id = $1 AND deleted_at IS NULL
    `,
      [id],
    );

    if (!row) {
      throw new NotFoundException('Target not found');
    }

    return row;
  }

  async updateTarget(id: number, data: UpdateTargetDto) {
    await this.findTarget(id);
    await this.validateTarget(data, id);

    const row = await this.queryOne(
      `
    UPDATE target_details
    SET
      year_id = COALESCE($2, year_id),
      deposit_target = COALESCE($3, deposit_target),
      advances_target = COALESCE($4, advances_target),
      npa_target = COALESCE($5, npa_target),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
    `,
      [
        id,
        data.year_id ?? null,
        data.deposit_target ?? null,
        data.advances_target ?? null,
        data.npa_target ?? null,
      ],
    );

    return row;
  }

  async deleteTarget(id: number) {
    await this.findTarget(id);

    await this.execute(
      `
    UPDATE target_details
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
      [id],
    );

    return { deleted: true };
  }

  async findByAuditUnit(auditUnitId: number) {
    return this.queryRows(
      `
    SELECT td.*, aum.name
    FROM target_details td
    LEFT JOIN audit_unit_master aum ON aum.id = td.audit_unit_id
    WHERE audit_unit_id = $1
      AND td.deleted_at IS NULL
    ORDER BY td.year_id DESC
    `,
      [auditUnitId],
    );
  }

  private async validateTarget(data: any, id?: number) {
    if (data.year_id && data.audit_unit_id) {
      const existing = await this.queryRows(
        `
      SELECT id
      FROM target_details
      WHERE year_id = $1
        AND audit_unit_id = $2
        AND deleted_at IS NULL
        AND ($3::int IS NULL OR id != $3)
      `,
        [data.year_id, data.audit_unit_id, id ?? null],
      );

      if (existing.length) {
        throw new BadRequestException(
          'Target already exists for this year and audit unit',
        );
      }
    }
  }

  async findByAuditAndYear(auditUnitId: number, yearId: number) {
    const row = await this.queryOne(
      `
    SELECT *
    FROM target_details
    WHERE audit_unit_id = $1
      AND year_id = $2
      AND deleted_at IS NULL
    `,
      [auditUnitId, yearId],
    );

    if (!row) {
      throw new NotFoundException('Target not found');
    }

    return row;
  }

  async getYears() {
    const rows = await this.queryRows(
      `
    SELECT id, year
    FROM year_master
    WHERE deleted_at IS NULL
    ORDER BY id DESC
    `,
    );

    return rows.map((r: any) => ({
      label: r.year,
      value: r.id,
    }));
  }
}
