import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import csv from 'csv-parser';

import { DatabaseService } from '../../../../core/database/database.service';

import {
  CreateAdvanceAccountDto,
  UpdateAdvanceAccountDto,
  AdvanceAccountFilterDto,
} from './dto/advance-accounts.dto';

@Injectable()
export class AdvanceAccountsService {
  constructor(private readonly db: DatabaseService) {}

  private stagedUploads = new Map<string, { rows: any[]; createdAt: number }>();

  private stageRows(rows: any[]) {
    const uploadKey = `ADV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const now = Date.now();

    for (const [key, value] of this.stagedUploads.entries()) {
      if (now - value.createdAt > 30 * 60 * 1000) {
        this.stagedUploads.delete(key);
      }
    }

    this.stagedUploads.set(uploadKey, {
      rows,
      createdAt: now,
    });

    return uploadKey;
  }

  async findAll(filters: AdvanceAccountFilterDto) {
    try {
      const page = Number(filters.page || 1);

      const limit = Number(filters.limit || 10);

      const offset = (page - 1) * limit;

      const conditions: string[] = ['da.deleted_at IS NULL'];

      const params: any[] = [];

      // SEARCH

      if (filters.search && filters.search_type) {
        params.push(`%${filters.search}%`);

        switch (filters.search_type) {
          case 'account_no':
            conditions.push(`da.account_no ILIKE $${params.length}`);

            break;

          case 'account_holder_name':
            conditions.push(`da.account_holder_name ILIKE $${params.length}`);

            break;

          case 'ucic':
            conditions.push(`da.ucic ILIKE $${params.length}`);

            break;
        }
      }

      // BRANCH

      if (filters.branch_id) {
        params.push(Number(filters.branch_id));

        conditions.push(`da.branch_id = $${params.length}`);
      }

      // SCHEME

      if (filters.scheme_id) {
        params.push(Number(filters.scheme_id));

        conditions.push(`da.scheme_id = $${params.length}`);
      }

      // PERIOD FROM

      if (filters.period_from) {
        params.push(filters.period_from);

        conditions.push(`da.upload_period_from <= $${params.length}`);
      }

      // PERIOD TO

      if (filters.period_to) {
        params.push(filters.period_to);

        conditions.push(`da.upload_period_to >= $${params.length}`);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      // TOTAL COUNT

      const countResult = await this.db.query(
        `
          SELECT COUNT(*)::int as total

          FROM dump_advances da

          ${whereClause}
          `,
        params,
      );

      // PAGINATION PARAMS

      params.push(limit);

      params.push(offset);

      // MAIN QUERY

      const result = await this.db.query(
        `
          SELECT

            da.*,

            aum.name as branch_name,

            sm.name as scheme_name

          FROM dump_advances da

          LEFT JOIN audit_unit_master aum
            ON aum.id = da.branch_id

          LEFT JOIN scheme_master sm
            ON sm.id = da.scheme_id

          ${whereClause}

          ORDER BY da.id DESC

          LIMIT $${params.length - 1}

          OFFSET $${params.length}
          `,
        params,
      );

      return {
        data: result.rows,

        total: countResult.rows[0]?.total || 0,

        page,

        limit,
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch deposit accounts');
    }
  }

  async findOne(id: number) {
    try {
      const result = await this.db.query(
        `
          SELECT *

          FROM dump_advances

          WHERE id = $1

          AND deleted_at IS NULL
          `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Advance account not found');
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async create(data: CreateAdvanceAccountDto) {
    try {
      await this.validateDuplicate(data.account_no);

      return await this.db.transaction(async (client) => {
        const result = await client.query(
          `
              INSERT INTO dump_advances (

                branch_id,

                scheme_id,

                account_no,

                npa_status,

                sanction_amount,

                renewal_date,

                outstanding_balance,

                due_date,

                account_holder_name,

                ucic,

                customer_type,

                intrest_rate,

                account_opening_date,

                balance_date,

                account_status,

                sampling_filter,

                assesment_period_id,

                admin_id

              )

              VALUES (

                $1,$2,$3,$4,$5,
                $6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,
                $16,$17,$18
              )

              RETURNING *
              `,
          [
            data.branch_id,

            data.scheme_id,

            data.account_no,

            data.npa_status,

            data.sanction_amount,

            data.renewal_date,

            data.outstanding_balance,

            data.due_date,

            data.account_holder_name,

            data.ucic,

            data.customer_type,

            data.intrest_rate,

            data.account_opening_date,

            data.balance_date,

            data.account_status,

            data.sampling_filter ?? 0,

            data.assesment_period_id,

            data.admin_id ?? 1,
          ],
        );

        return result.rows[0];
      });
    } catch (error) {
      throw error;
    }
  }

  async update(
    id: number,

    data: UpdateAdvanceAccountDto,
  ) {
    try {
      const existing = await this.findOne(id);

      if (Number(existing.assesment_period_id) !== 0) {
        throw new BadRequestException(
          'Assessment already done for this account',
        );
      }

      if (data.account_no) {
        await this.validateDuplicate(data.account_no, id);
      }

      const result = await this.db.query(
        `
          UPDATE dump_advances

          SET

            branch_id = COALESCE(
              $2,
              branch_id
            ),

            scheme_id = COALESCE(
              $3,
              scheme_id
            ),

            account_no = COALESCE(
              $4,
              account_no
            ),

            account_holder_name = COALESCE(
              $5,
              account_holder_name
            ),

            ucic = COALESCE(
              $6,
              ucic
            ),

            customer_type = COALESCE(
              $7,
              customer_type
            ),

            intrest_rate = COALESCE(
              $8,
              intrest_rate
            ),

            outstanding_balance = COALESCE(
              $9,
              outstanding_balance
            ),

            account_status = COALESCE(
              $10,
              account_status
            ),

             npa_status = COALESCE(
              $11,
              npa_status
            ),

            sanction_amount = COALESCE(
              $12,
              sanction_amount
            ),  

            updated_at = CURRENT_TIMESTAMP

          WHERE id = $1

          RETURNING *
          `,
        [
          id,

          data.branch_id,

          data.scheme_id,

          data.account_no,

          data.account_holder_name,

          data.ucic,

          data.customer_type,

          data.intrest_rate,

          data.outstanding_balance,

          data.account_status,

          data.npa_status,

          data.sanction_amount,
        ],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async remove(id: number) {
    try {
      const existing = await this.findOne(id);

      if (Number(existing.sampling_filter) !== 0) {
        throw new BadRequestException('Sampled account cannot be deleted');
      }

      const result = await this.db.query(
        `
          UPDATE dump_advances

          SET
            deleted_at = CURRENT_TIMESTAMP

          WHERE id = $1

          AND deleted_at IS NULL

          RETURNING *
          `,
        [id],
      );

      if (!result.rows.length) {
        throw new NotFoundException('Advance account not found');
      }

      return {
        message: 'Advance account deleted successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  async getUploadDumps() {
    const result = await this.db.query(
      `
            SELECT DISTINCT

                TO_CHAR(
                    upload_period_from,
                    'DD-MM-YYYY'
                )

                ||

                ' To '

                ||

                TO_CHAR(
                    upload_period_to,
                    'DD-MM-YYYY'
                )

                AS upload_period,

                TO_CHAR(
                    upload_date,
                    'DD-MM-YYYY HH24:MI'
                ) AS upload_date

            FROM dump_advances

            WHERE deleted_at IS NULL

            ORDER BY upload_date DESC
            `,
    );

    return result.rows;
  }

  private async validateDuplicate(
    accountNo: string,

    id?: number,
  ) {
    const params: any[] = [accountNo];

    let query = `
      SELECT id

      FROM dump_advances

      WHERE account_no = $1

      AND deleted_at IS NULL
    `;

    if (id) {
      params.push(id);

      query += `
        AND id != $2
      `;
    }

    const result = await this.db.query(query, params);

    if (result.rows.length) {
      throw new BadRequestException('Account number already exists');
    }
  }

  // Dump Upload

  private toUpper(value: any): string {
    return String(value || '')
      .trim()
      .toUpperCase();
  }

  private toDecimal(value: any): string {
    const num = parseFloat(
      String(value || '')
        .replace(/,/g, '')
        .trim(),
    );

    return isNaN(num) ? '0.00' : num.toFixed(2);
  }

  private formatCsvDate(value: any): string | null {
    if (!value) {
      return null;
    }

    const str = String(value).trim();

    if (!str || str === '31/12/1899') {
      return null;
    }

    // dd/mm/yyyy
    if (str.includes('/')) {
      const parts = str.split('/');

      if (parts.length !== 3) {
        return null;
      }

      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    const d = new Date(str);

    if (isNaN(d.getTime())) {
      return null;
    }

    const year = d.getFullYear();

    const month = String(d.getMonth() + 1).padStart(2, '0');

    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private parseCsv(file: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];

      let rowIndex = 0;

      file.file

        .pipe(
          csv({
            headers: false,
          }),
        )

        .on('data', (data: any) => {
          const row = Object.values(data);

          // Skip header row
          if (rowIndex++ === 0) {
            return;
          }

          results.push(row);
        })

        .on('end', () => resolve(results))

        .on('error', reject);
    });
  }

  private normalizeCode(value: any): string {
    return String(value || '')
      .trim()

      .replace(/^0+/, '')

      .replace(/\.0$/, '');
  }

  async validateUpload(file: any, payload: any) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    if (!file.filename.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are allowed');
    }

    const rows = await this.parseCsv(file);

    const filteredRows = rows.filter((row) => {
      return Object.values(row).some(
        (value) => String(value || '').trim() !== '',
      );
    });

    if (!filteredRows.length) {
      throw new BadRequestException('CSV file is empty');
    }

    const uploadDate = this.formatCsvDate(payload.upload_date);

    const uploadPeriodFrom = this.formatCsvDate(payload.period_from);

    const uploadPeriodTo = this.formatCsvDate(payload.period_to);

    if (!uploadDate || !uploadPeriodFrom || !uploadPeriodTo) {
      throw new BadRequestException(
        'Upload date and upload period dates are required',
      );
    }

    if (new Date(uploadPeriodTo) <= new Date(uploadPeriodFrom)) {
      throw new BadRequestException(
        'Upload period to date must be greater than period from date',
      );
    }

    const uploadDateTime = `${uploadDate} ${new Date().toTimeString().slice(0, 8)}`;

    // =========================================
    // PRELOAD BRANCHES
    // =========================================

    const branches = await this.db.query(
      `
            SELECT
                id,
                audit_unit_code
            FROM audit_unit_master
            WHERE is_active = 1
              AND deleted_at IS NULL
            `,
    );

    const branchMap = new Map();

    for (const branch of branches.rows) {
      branchMap.set(
        this.normalizeCode(branch.audit_unit_code),

        branch.id,
      );
    }

    // =========================================
    // PRELOAD SCHEMES
    // =========================================

    const schemes = await this.db.query(
      `
            SELECT
                id,
                scheme_code
            FROM scheme_master
            WHERE is_active = 1
              AND deleted_at IS NULL
            `,
    );

    const schemeMap = new Map();

    for (const scheme of schemes.rows) {
      schemeMap.set(
        this.normalizeCode(scheme.scheme_code),

        scheme.id,
      );
    }

    // =========================================
    // PRELOAD EXISTING ACCOUNTS
    // =========================================

    const existingAccounts = await this.db.query(
      `
            SELECT
                branch_id,
                scheme_id,
                account_no,
                account_opening_date,
                renewal_date
            FROM dump_advances
            WHERE deleted_at IS NULL
            `,
    );

    const existingAccountSet = new Set(
      existingAccounts.rows.map((x: any) =>
        [
          Number(x.branch_id || 0),
          Number(x.scheme_id || 0),
          String(x.account_no || '').trim(),
          this.formatCsvDate(x.account_opening_date),
          this.formatCsvDate(x.renewal_date),
        ].join('|'),
      ),
    );

    // =========================================
    // COUNTERS
    // =========================================

    let failed = 0;

    const errors: any[] = [];

    const insertValues: any[] = [];

    // =========================================
    // LOOP
    // =========================================

    const duplicateAccounts: string[] = [];
    const duplicateAccountSet = new Set<string>();
    const duplicateRows = new Set<number>();
    const uploadDumpKey = `UP${Date.now()}`;

    for (let i = 0; i < filteredRows.length; i++) {
      const c_data = filteredRows[i];

      if (c_data.length !== 17) {
        failed++;

        errors.push({
          row: i + 1,

          error: 'Column count mismatch',
        });

        continue;
      }

      const row = {
        branch_code: String(c_data[0] || '').trim(),

        scheme_code: String(c_data[2] || '').trim(),

        account_no: String(c_data[4] || '').trim(),

        account_holder_name: this.toUpper(c_data[5]),

        ucic: this.toUpper(c_data[6]),

        customer_type: this.toUpper(c_data[7]),

        account_opening_date: this.formatCsvDate(c_data[8]),

        renewal_date: this.formatCsvDate(c_data[9]),

        sanction_amount: this.toDecimal(c_data[10]),

        intrest_rate: this.toDecimal(c_data[11]),

        due_date: this.formatCsvDate(c_data[12]),

        outstanding_balance: this.toDecimal(c_data[13]),

        balance_date: this.formatCsvDate(c_data[14]),

        npa_status: this.toUpper(c_data[15]),

        account_status: this.toUpper(c_data[16]),
      };

      try {
        // =====================================
        // REQUIRED VALIDATION
        // =====================================

        if (
          !row.account_no ||
          !row.branch_code ||
          !row.scheme_code ||
          !row.account_holder_name
        ) {
          failed++;

          errors.push({
            row: i + 1,

            error: 'Required fields missing',
          });

          continue;
        }

        const periodFrom = new Date(uploadPeriodFrom);

        const periodTo = new Date(uploadPeriodTo);

        if (!row.account_opening_date) {
          failed++;

          errors.push({
            row: i + 1,

            error: 'Account opening date is required or invalid',
          });

          continue;
        }

        if (String(c_data[9] || '').trim() && !row.renewal_date) {
          failed++;

          errors.push({
            row: i + 1,

            error: 'Renewal date is invalid',
          });

          continue;
        }

        const renewalDate = row.renewal_date;

        const isRenewalInPeriod =
          !!renewalDate &&
          new Date(renewalDate) >= periodFrom &&
          new Date(renewalDate) <= periodTo;

        if (!isRenewalInPeriod) {
          const openingDate = row.account_opening_date;

          const open = new Date(openingDate);

          if (open < periodFrom || open > periodTo) {
            failed++;

            errors.push({
              row: i + 1,

              error:
                'Account opening date or renewal date must be within selected dump period',
            });

            continue;
          }
        }

        // =====================================
        // BRANCH MAP LOOKUP
        // =====================================

        const branchId = branchMap.get(this.normalizeCode(row.branch_code));

        if (!branchId) {
          failed++;

          errors.push({
            row: i + 1,

            error: 'Invalid branch code',
          });

          continue;
        }

        // =====================================
        // SCHEME MAP LOOKUP
        // =====================================

        const schemeId = schemeMap.get(this.normalizeCode(row.scheme_code));

        if (!schemeId) {
          failed++;

          errors.push({
            row: i + 1,

            error: 'Invalid scheme code',
          });

          continue;
        }

        // =====================================
        // DUPLICATE CHECK
        // =====================================

        const accountNo = String(row.account_no).trim();
        const accountKey = [
          Number(branchId),
          Number(schemeId),
          accountNo,
          this.formatCsvDate(row.account_opening_date),
          this.formatCsvDate(row.renewal_date),
        ].join('|');

        if (existingAccountSet.has(accountKey)) {
          duplicateAccounts.push(accountNo);

          duplicateAccountSet.add(accountKey);

          duplicateRows.add(i + 1);

          continue;
        }

        // =====================================
        // INSERT
        // =====================================

        insertValues.push([
          branchId,

          schemeId,

          row.account_no,

          row.npa_status,

          row.sanction_amount,

          row.outstanding_balance,

          row.renewal_date,

          row.due_date,

          row.account_holder_name,

          row.ucic,

          row.customer_type,

          row.intrest_rate,

          row.account_opening_date,

          row.balance_date,

          row.account_status,

          uploadDateTime,

          uploadPeriodFrom,

          uploadPeriodTo,

          uploadDumpKey,

          0,

          0,

          1,
        ]);
        // =====================================
        // ADD TO SET
        // =====================================

        existingAccountSet.add(accountKey);
      } catch (err: any) {
        failed++;

        errors.push({
          row: i + 1,

          error: err?.message || 'Upload failed',
        });
      }
    }

    const errorByRow = new Map(
      errors.map((error: any) => [Number(error.row), error.error]),
    );

    const hasErrors = duplicateAccounts.length > 0 || errors.length > 0;

    const previewSource = hasErrors
      ? filteredRows
          .map((row: any[], index: number) => ({
            row,
            rowNumber: index + 1,
          }))
          .filter(
            (item: any) =>
              duplicateRows.has(item.rowNumber) ||
              errorByRow.has(item.rowNumber),
          )
          .slice(0, 200)
      : filteredRows.slice(0, 200).map((row: any[], index: number) => ({
          row,
          rowNumber: index + 1,
        }));

    const previewRows = previewSource.map((item: any) => ({
      sr_no: item.rowNumber,

      branch_code: item.row[0],

      scheme_code: item.row[2],

      account_no: item.row[4],

      account_holder_name: item.row[5],

      status: duplicateRows.has(item.rowNumber)
        ? 'DUPLICATE ACCOUNT NUMBER'
        : errorByRow.get(item.rowNumber) || 'VALID',
    }));

    return {
      rows: previewRows,

      validRows: [],

      uploadKey: hasErrors ? null : this.stageRows(insertValues),

      totalRows: filteredRows.length,

      validCount: insertValues.length,

      hasErrors: hasErrors,

      duplicates: duplicateAccounts,

      errors,
      errorSummary: [
        ...errors.map((e: any) => e.error),
        ...(duplicateAccounts.length > 0
          ? ['Duplicate account numbers found']
          : []),
      ],
    };
  }

  async addDump(rowsOrKey: any[] | string) {
    const rows =
      typeof rowsOrKey === 'string'
        ? this.stagedUploads.get(rowsOrKey)?.rows || []
        : Array.isArray(rowsOrKey)
          ? rowsOrKey
          : [];

    if (!rows.length) {
      throw new BadRequestException('No valid rows found');
    }

    const insertChunk = async (chunk: any[]) => {
      const placeholders: string[] = [];

      const values: any[] = [];

      let paramIndex = 1;

      for (const row of chunk) {
        values.push(...row);

        placeholders.push(`(

        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},
        $${paramIndex++},

        NOW(),

        NOW()
    )`);
      }

      await this.db.query(
        `
        INSERT INTO dump_advances (

            branch_id,
            scheme_id,
            account_no,
            npa_status,
            sanction_amount,
            outstanding_balance,
            renewal_date,
            due_date,
            account_holder_name,
            ucic,
            customer_type,
            intrest_rate,
            account_opening_date,
            balance_date,
            account_status,
            upload_date,
            upload_period_from,
            upload_period_to,
            upload_key,
            sampling_filter,
            assesment_period_id,
            admin_id,
            created_at,
            updated_at

        )

        VALUES

        ${placeholders.join(',')}
        `,
        values,
      );
    };

    const chunkSize = 1000;

    for (let index = 0; index < rows.length; index += chunkSize) {
      await insertChunk(rows.slice(index, index + chunkSize));
    }

    if (typeof rowsOrKey === 'string') {
      this.stagedUploads.delete(rowsOrKey);
    }

    return {
      inserted: rows.length,
    };
  }
}
