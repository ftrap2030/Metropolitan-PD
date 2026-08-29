import { getLeoGuildConfig, patchLeoGuildConfig } from './leoState.js';

const shiftStatsKey = (guildId) => `leo:department:shiftstats:${guildId}`;
const activeShiftsKey = (guildId) => `leo:department:activeshifts:${guildId}`;
const loaRecordsKey = (guildId) => `leo:department:loa:${guildId}`;
const loaCounterKey = (guildId) => `leo:department:loa-counter:${guildId}`;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireDb(client) {
  if (!client?.db?.get || !client?.db?.set) {
    throw new Error('Database is unavailable.');
  }
}

export function formatDuration(ms) {
  const safe = Math.max(0, Number(ms) || 0);
  const totalMinutes = Math.floor(safe / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

export function normalizeCallsign(raw) {
  return String(raw || '').trim().toUpperCase();
}

export function isValidCallsign(raw) {
  const value = normalizeCallsign(raw);
  return /^[A-Z0-9][A-Z0-9-]{0,15}$/.test(value);
}

export async function getActiveShifts(client, guildId) {
  requireDb(client);
  return asObject(await client.db.get(activeShiftsKey(guildId), {}));
}

export async function getShiftStatsMap(client, guildId) {
  requireDb(client);
  return asObject(await client.db.get(shiftStatsKey(guildId), {}));
}

export async function startShift(client, guildId, userId) {
  requireDb(client);
  const active = await getActiveShifts(client, guildId);
  const id = String(userId);
  if (active[id]) {
    return { ok: false, reason: 'already_active', shift: active[id] };
  }

  const shift = { startedAt: Date.now() };
  active[id] = shift;
  await client.db.set(activeShiftsKey(guildId), active);
  return { ok: true, shift };
}

export async function endShift(client, guildId, userId) {
  requireDb(client);
  const active = await getActiveShifts(client, guildId);
  const id = String(userId);
  const shift = active[id];
  if (!shift?.startedAt) return { ok: false, reason: 'not_active' };

  const endedAt = Date.now();
  const durationMs = Math.max(0, endedAt - Number(shift.startedAt));
  delete active[id];

  const stats = await getShiftStatsMap(client, guildId);
  const current = asObject(stats[id]);
  stats[id] = {
    totalMs: Math.max(0, Number(current.totalMs) || 0) + durationMs,
    shiftsCompleted: Math.max(0, Number(current.shiftsCompleted) || 0) + 1,
    lastStart: Number(shift.startedAt),
    lastEnd: endedAt,
  };

  await client.db.set(activeShiftsKey(guildId), active);
  await client.db.set(shiftStatsKey(guildId), stats);
  return { ok: true, durationMs, startedAt: Number(shift.startedAt), endedAt, stats: stats[id] };
}

export async function getShiftSummary(client, guildId, userId) {
  const [active, stats] = await Promise.all([
    getActiveShifts(client, guildId),
    getShiftStatsMap(client, guildId),
  ]);
  const id = String(userId);
  const record = asObject(stats[id]);
  const activeShift = active[id] || null;
  const ongoingMs = activeShift?.startedAt ? Math.max(0, Date.now() - Number(activeShift.startedAt)) : 0;
  return {
    active: Boolean(activeShift),
    startedAt: activeShift?.startedAt || null,
    ongoingMs,
    totalMs: Math.max(0, Number(record.totalMs) || 0),
    totalWithCurrentMs: Math.max(0, Number(record.totalMs) || 0) + ongoingMs,
    shiftsCompleted: Math.max(0, Number(record.shiftsCompleted) || 0),
    lastStart: record.lastStart || null,
    lastEnd: record.lastEnd || null,
  };
}

export async function getShiftLeaderboard(client, guildId, limit = 10) {
  const [active, stats] = await Promise.all([
    getActiveShifts(client, guildId),
    getShiftStatsMap(client, guildId),
  ]);
  const ids = new Set([...Object.keys(stats), ...Object.keys(active)]);
  const now = Date.now();
  return [...ids].map((userId) => {
    const record = asObject(stats[userId]);
    const ongoingMs = active[userId]?.startedAt ? Math.max(0, now - Number(active[userId].startedAt)) : 0;
    return {
      userId,
      active: Boolean(active[userId]),
      totalMs: Math.max(0, Number(record.totalMs) || 0) + ongoingMs,
      shiftsCompleted: Math.max(0, Number(record.shiftsCompleted) || 0),
    };
  }).sort((a, b) => b.totalMs - a.totalMs).slice(0, Math.max(1, Math.min(25, limit)));
}

export function isValidReturnDate(raw) {
  const value = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T23:59:59Z`);
  return Number.isFinite(parsed) && parsed >= Date.now() - 86_400_000;
}

export async function getLoaRecords(client, guildId) {
  requireDb(client);
  return asObject(await client.db.get(loaRecordsKey(guildId), {}));
}

async function nextLoaId(client, guildId) {
  requireDb(client);
  const current = Math.max(0, Number(await client.db.get(loaCounterKey(guildId), 0)) || 0);
  const next = current + 1;
  await client.db.set(loaCounterKey(guildId), next);
  return next;
}

export async function createLoaRequest(client, guildId, userId, reason, returnDate) {
  const records = await getLoaRecords(client, guildId);
  const existing = Object.values(records).find((record) =>
    String(record.userId) === String(userId) && ['pending', 'approved'].includes(record.status)
  );
  if (existing) return { ok: false, reason: 'existing', record: existing };

  const id = await nextLoaId(client, guildId);
  const record = {
    id,
    userId: String(userId),
    reason: String(reason).trim(),
    returnDate,
    status: 'pending',
    createdAt: Date.now(),
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    endedAt: null,
  };
  records[String(id)] = record;
  await client.db.set(loaRecordsKey(guildId), records);
  return { ok: true, record };
}

export async function reviewLoa(client, guildId, caseId, reviewerId, decision, note = null) {
  const records = await getLoaRecords(client, guildId);
  const key = String(caseId);
  const record = records[key];
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.status !== 'pending') return { ok: false, reason: 'not_pending', record };
  if (!['approved', 'denied'].includes(decision)) return { ok: false, reason: 'invalid_decision' };

  records[key] = {
    ...record,
    status: decision,
    reviewedAt: Date.now(),
    reviewedBy: String(reviewerId),
    reviewNote: note ? String(note).trim() : null,
  };
  await client.db.set(loaRecordsKey(guildId), records);
  return { ok: true, record: records[key] };
}

export async function endLoa(client, guildId, userId, caseId = null) {
  const records = await getLoaRecords(client, guildId);
  let record = null;
  if (caseId !== null && caseId !== undefined) {
    record = records[String(caseId)] || null;
  } else {
    record = Object.values(records)
      .filter((item) => String(item.userId) === String(userId) && ['pending', 'approved'].includes(item.status))
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] || null;
  }
  if (!record) return { ok: false, reason: 'not_found' };
  if (String(record.userId) !== String(userId)) return { ok: false, reason: 'not_owner', record };
  if (!['pending', 'approved'].includes(record.status)) return { ok: false, reason: 'not_active', record };

  const key = String(record.id);
  records[key] = { ...record, status: 'ended', endedAt: Date.now() };
  await client.db.set(loaRecordsKey(guildId), records);
  return { ok: true, record: records[key] };
}

export async function getCallsigns(client, guildId) {
  const leo = await getLeoGuildConfig(client, guildId);
  return asObject(leo.callsigns);
}

export async function setCallsign(client, guildId, userId, callsign) {
  const callsigns = await getCallsigns(client, guildId);
  const id = String(userId);
  if (callsign === null) {
    delete callsigns[id];
    await patchLeoGuildConfig(client, guildId, { callsigns });
    return { ok: true, callsign: null };
  }

  const normalized = normalizeCallsign(callsign);
  if (!isValidCallsign(normalized)) return { ok: false, reason: 'invalid' };
  const duplicate = Object.entries(callsigns).find(([otherId, value]) => otherId !== id && normalizeCallsign(value) === normalized);
  if (duplicate) return { ok: false, reason: 'duplicate', duplicateUserId: duplicate[0] };

  callsigns[id] = normalized;
  await patchLeoGuildConfig(client, guildId, { callsigns });
  return { ok: true, callsign: normalized };
}
