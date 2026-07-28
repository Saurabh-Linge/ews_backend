import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class ManageAssementMasterService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(
    assesment_period_from: string,
    assesment_period_to: string,
    audit_unit_id: number,
  ) {
    if (!assesment_period_from || !assesment_period_to) {
      throw new BadRequestException(
        'assesment_period_from and assesment_period_to are required',
      );
    }

    return this.db.query(
      `
    SELECT 
    asm.id,
    asm.audit_unit_id,
    aum.audit_unit_code,
    aum.name,
    asm.assesment_period_from,
    asm.assesment_period_to,
    asm.audit_status_id,
    asm.audit_start_date,
    asm.audit_end_date,
    asm.audit_due_date,
    asm.compliance_start_date,
    asm.compliance_end_date,
    asm.compliance_due_date,
    asm.compliance_review_reject_limit,
    asm.is_limit_blocked,

    em.name AS branch_head_name,
    em1.name AS branch_subhead_name,

    em.id AS branch_head_code,
    em1.id AS branch_subhead_code,

    em2.name AS auditor_name,
    em2.id AS auditor_code

FROM audit_assesment_master asm

LEFT JOIN audit_unit_master aum 
    ON aum.id = asm.audit_unit_id 

LEFT JOIN employee_master em 
    ON em.id = aum.branch_head_id

LEFT JOIN employee_master em1 
    ON em1.id = aum.branch_subhead_id  

LEFT JOIN LATERAL (
    SELECT id, name
    FROM employee_master em2
    WHERE asm.audit_unit_id::text = ANY(
        string_to_array(em2.audit_unit_authority, ',')
    )
    LIMIT 1
) em2 ON true

WHERE asm.deleted_at IS NULL
  AND DATE(asm.assesment_period_from) >= $1
  AND DATE(asm.assesment_period_to) <= $2
  AND asm.audit_unit_id = $3

ORDER BY asm.id DESC;
    `,
      [assesment_period_from, assesment_period_to, audit_unit_id],
    );
  }

  async update(id: number, body: any) {
    const fields = [];
    const values = [];

    let index = 1;

    // Audit Due Date
    if (body.audit_due_date !== undefined) {
      fields.push(`audit_due_date = $${index++}`);

      values.push(body.audit_due_date);
    }

    // Compliance Due Date
    if (body.compliance_due_date !== undefined) {
      fields.push(`compliance_due_date = $${index++}`);

      values.push(body.compliance_due_date);
    }

    // Compliance Review Reject Limit
    if (body.compliance_review_reject_limit !== undefined) {
      fields.push(`
      compliance_review_reject_limit =
      compliance_review_reject_limit + $${index++}
    `);

      values.push(body.compliance_review_reject_limit);
    }

    // Block Status
    if (body.is_limit_blocked !== undefined) {
      fields.push(`is_limit_blocked = $${index++}`);

      values.push(body.is_limit_blocked);
    }

    // Updated At
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    // ID
    values.push(id);

    const query = `
        UPDATE audit_assesment_master
        SET ${fields.join(', ')}
        WHERE id = $${index}
        RETURNING *;
    `;

    return this.db.query(query, values);
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
