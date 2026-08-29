import { getLeoGuildConfig, patchLeoGuildConfig } from './leoState.js';

const sessionRecordsKey = (guildId) => `leo:ops:sessions:${guildId}`;
const sessionCounterKey = (guildId) => `leo:ops:sessions-counter:${guildId}`;
const activeSessionKey = (guildId) => `leo:ops:active-session:${guildId}`;
const certificationRecordsKey = (guildId) => `leo:ops:certifications:${guildId}`;
const certificationCounterKey = (guildId) => `leo:ops:certifications-counter:${guildId}`;
const boloRecordsKey = (guildId) => `leo:ops:bolos:${guildId}`;
const boloCounterKey = (guildId) => `leo:ops:bolos-counter:${guildId}`;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireDb(client) {
  if (!client?.db?.get || !client?.db?.set) throw new Error('Database is unavailable.');
}

async function nextCounter(client, key) {
  requireDb(client);
  const current = Math.max(0, Number(await client.db.get(key, 0)) || 0);
  const next = current + 1;
  await client.db.set(key, next);
  return next;
}

export async function getSessionRecords(client, guildId) {
  requireDb(client);
  return asObject(await client.db.get(sessionRecordsKey(guildId), {}));
}

export async function getActiveSession(client, guildId) {
  requireDb(client);
  const id = await client.db.get(activeSessionKey(guildId), null);
  if (!id) return null;
  const records = await getSessionRecords(client, guildId);
  return records[String(id)] || null;
}

export async function startPatrolSession(client, guildId, hostId, name = 'Patrol Session') {
  requireDb(client);
  const existing = await getActiveSession(client, guildId);
  if (existing) return { ok: false, reason: 'already_active', record: existing };

  const id = await nextCounter(client, sessionCounterKey(guildId));
  const records = await getSessionRecords(client, guildId);
  const record = {
    id,
    name: String(name || 'Patrol Session').trim().slice(0, 100) || 'Patrol Session',
    hostId: String(hostId),
    startedAt: Date.now(),
    endedAt: null,
    endedBy: null,
    status: 'active',
  };
  records[String(id)] = record;
  await client.db.set(sessionRecordsKey(guildId), records);
  await client.db.set(activeSessionKey(guildId), id);
  return { ok: true, record };
}

export async function endPatrolSession(client, guildId, endedBy) {
  requireDb(client);
  const active = await getActiveSession(client, guildId);
  if (!active) return { ok: false, reason: 'not_active' };

  const records = await getSessionRecords(client, guildId);
  const key = String(active.id);
  const endedAt = Date.now();
  records[key] = {
    ...active,
    status: 'ended',
    endedAt,
    endedBy: String(endedBy),
  };
  await client.db.set(sessionRecordsKey(guildId), records);
  await client.db.delete?.(activeSessionKey(guildId));
  if (!client.db.delete) await client.db.set(activeSessionKey(guildId), null);
  return { ok: true, record: records[key], durationMs: Math.max(0, endedAt - Number(active.startedAt)) };
}

export async function getSessionHistory(client, guildId, limit = 10) {
  const records = await getSessionRecords(client, guildId);
  return Object.values(records)
    .sort((a, b) => Number(b.startedAt) - Number(a.startedAt))
    .slice(0, Math.max(1, Math.min(25, Number(limit) || 10)));
}

export async function getTrainingTypes(client, guildId) {
  const leo = await getLeoGuildConfig(client, guildId);
  const values = Array.isArray(leo.trainingTypes) ? leo.trainingTypes : [];
  return values.map((value) => String(value).trim()).filter(Boolean);
}

export async function addTrainingType(client, guildId, name) {
  const types = await getTrainingTypes(client, guildId);
  const value = String(name || '').trim().slice(0, 100);
  if (!value) return { ok: false, reason: 'invalid' };
  const existing = types.find((item) => item.toLowerCase() === value.toLowerCase());
  if (existing) return { ok: false, reason: 'duplicate', name: existing };
  types.push(value);
  await patchLeoGuildConfig(client, guildId, { trainingTypes: types });
  return { ok: true, name: value, types };
}

export async function removeTrainingType(client, guildId, name) {
  const types = await getTrainingTypes(client, guildId);
  const target = String(name || '').trim().toLowerCase();
  const existing = types.find((item) => item.toLowerCase() === target);
  if (!existing) return { ok: false, reason: 'not_found' };
  const next = types.filter((item) => item.toLowerCase() !== target);
  await patchLeoGuildConfig(client, guildId, { trainingTypes: next });
  return { ok: true, name: existing, types: next };
}

export async function resolveTrainingType(client, guildId, name) {
  const types = await getTrainingTypes(client, guildId);
  if (!types.length) return { ok: true, name: String(name || '').trim(), configured: false };
  const target = String(name || '').trim().toLowerCase();
  const existing = types.find((item) => item.toLowerCase() === target);
  return existing
    ? { ok: true, name: existing, configured: true, types }
    : { ok: false, reason: 'not_configured', types };
}

export async function getCertificationRecords(client, guildId) {
  requireDb(client);
  return asObject(await client.db.get(certificationRecordsKey(guildId), {}));
}

export async function issueCertification(client, guildId, data) {
  requireDb(client);
  const records = await getCertificationRecords(client, guildId);
  const certification = String(data.certification || '').trim().slice(0, 100);
  if (!certification) return { ok: false, reason: 'invalid' };
  const duplicate = Object.values(records).find((record) =>
    String(record.userId) === String(data.userId)
    && record.status === 'active'
    && String(record.certification).toLowerCase() === certification.toLowerCase()
  );
  if (duplicate) return { ok: false, reason: 'duplicate', record: duplicate };

  const id = await nextCounter(client, certificationCounterKey(guildId));
  const record = {
    id,
    userId: String(data.userId),
    certification,
    issuedBy: String(data.issuedBy),
    issuedAt: Date.now(),
    expiresOn: data.expiresOn || null,
    notes: data.notes ? String(data.notes).trim().slice(0, 1000) : null,
    status: 'active',
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
  };
  records[String(id)] = record;
  await client.db.set(certificationRecordsKey(guildId), records);
  return { ok: true, record };
}

export async function revokeCertification(client, guildId, userId, certification, revokedBy, reason = null) {
  requireDb(client);
  const records = await getCertificationRecords(client, guildId);
  const target = String(certification || '').trim().toLowerCase();
  const record = Object.values(records)
    .filter((item) => String(item.userId) === String(userId) && item.status === 'active')
    .find((item) => String(item.certification).toLowerCase() === target);
  if (!record) return { ok: false, reason: 'not_found' };
  const key = String(record.id);
  records[key] = {
    ...record,
    status: 'revoked',
    revokedAt: Date.now(),
    revokedBy: String(revokedBy),
    revokeReason: reason ? String(reason).trim().slice(0, 1000) : null,
  };
  await client.db.set(certificationRecordsKey(guildId), records);
  return { ok: true, record: records[key] };
}

export async function getUserCertifications(client, guildId, userId, includeInactive = false) {
  const records = await getCertificationRecords(client, guildId);
  const today = new Date().toISOString().slice(0, 10);
  return Object.values(records)
    .filter((record) => String(record.userId) === String(userId))
    .filter((record) => includeInactive || (record.status === 'active' && (!record.expiresOn || record.expiresOn >= today)))
    .sort((a, b) => Number(b.issuedAt) - Number(a.issuedAt));
}

export async function getBoloRecords(client, guildId) {
  requireDb(client);
  return asObject(await client.db.get(boloRecordsKey(guildId), {}));
}

export async function addBolo(client, guildId, data) {
  requireDb(client);
  const id = await nextCounter(client, boloCounterKey(guildId));
  const records = await getBoloRecords(client, guildId);
  const createdAt = Date.now();
  const expiresHours = Number(data.expiresHours);
  const record = {
    id,
    type: String(data.type || 'other'),
    subject: String(data.subject || '').trim().slice(0, 150),
    details: String(data.details || '').trim().slice(0, 1500),
    createdBy: String(data.createdBy),
    createdAt,
    expiresAt: Number.isFinite(expiresHours) && expiresHours > 0 ? createdAt + expiresHours * 3_600_000 : null,
    status: 'active',
    removedAt: null,
    removedBy: null,
  };
  if (!record.subject || !record.details) return { ok: false, reason: 'invalid' };
  records[String(id)] = record;
  await client.db.set(boloRecordsKey(guildId), records);
  return { ok: true, record };
}

export async function removeBolo(client, guildId, boloId, removedBy) {
  requireDb(client);
  const records = await getBoloRecords(client, guildId);
  const key = String(boloId);
  const record = records[key];
  if (!record || record.status !== 'active') return { ok: false, reason: 'not_found' };
  records[key] = { ...record, status: 'removed', removedAt: Date.now(), removedBy: String(removedBy) };
  await client.db.set(boloRecordsKey(guildId), records);
  return { ok: true, record: records[key] };
}

export async function clearBolos(client, guildId, removedBy) {
  requireDb(client);
  const records = await getBoloRecords(client, guildId);
  const now = Date.now();
  let count = 0;
  for (const [key, record] of Object.entries(records)) {
    if (record.status !== 'active') continue;
    records[key] = { ...record, status: 'removed', removedAt: now, removedBy: String(removedBy) };
    count += 1;
  }
  await client.db.set(boloRecordsKey(guildId), records);
  return count;
}

export async function getActiveBolos(client, guildId) {
  const records = await getBoloRecords(client, guildId);
  const now = Date.now();
  return Object.values(records)
    .filter((record) => record.status === 'active' && (!record.expiresAt || Number(record.expiresAt) > now))
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}
