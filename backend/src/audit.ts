import { AuditLogModel } from "./models.js";

interface AuditEventInput {
  familyId: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(event: AuditEventInput): Promise<void> {
  try {
    await AuditLogModel.create({
      ...event,
      metadata: event.metadata || {}
    });
  } catch (error) {
    console.error("Failed to persist audit log", error);
  }
}

export async function listAuditLogs(
  familyId: string,
  options?: {
    limit?: number;
    offset?: number;
    from?: string;
    to?: string;
    action?: string;
    actorEmail?: string;
  }
): Promise<{
  rows: Array<{
    id: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId?: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  total: number;
}> {
  const filter: Record<string, unknown> = { familyId };
  if (options?.action) filter.action = options.action;
  if (options?.actorEmail) filter.actorEmail = options.actorEmail.toLowerCase();
  if (options?.from || options?.to) {
    const range: Record<string, Date> = {};
    if (options.from) range.$gte = new Date(options.from);
    if (options.to) range.$lte = new Date(options.to);
    filter.createdAt = range;
  }
  const limit = Math.min(Math.max(options?.limit || 80, 1), 300);
  const offset = Math.max(options?.offset || 0, 0);
  const [rows, total] = await Promise.all([
    AuditLogModel.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
    AuditLogModel.countDocuments(filter)
  ]);
  return {
    total,
    rows: rows.map((row) => ({
    id: row._id.toString(),
    actorEmail: row.actorEmail,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId || undefined,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString()
    }))
  };
}
