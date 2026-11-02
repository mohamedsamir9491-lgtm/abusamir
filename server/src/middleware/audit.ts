import type { Request } from 'express';
import { query, type Queryable } from '../db/pool.js';
import { logger } from '../lib/logger.js';

export interface AuditInput {
  action: string;
  entityType?: string;
  entityId?: string | number | null;
  clientId?: string | null;
  details?: Record<string, unknown>;
}

export async function audit(req: Request | null, input: AuditInput, db?: Queryable): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, client_id, details, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req?.user?.id ?? null, input.action, input.entityType ?? null,
        input.entityId == null ? null : String(input.entityId), input.clientId ?? null,
        JSON.stringify(input.details ?? {}), req?.ip ?? null, req?.headers['user-agent'] ?? null],
      db,
    );
  } catch (e) {
    logger.error({ err: e, input }, 'audit log write failed');
  }
}
