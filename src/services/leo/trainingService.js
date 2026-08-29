const recordsKey = (guildId) => `leo:training:records:${guildId}`;
const counterKey = (guildId) => `leo:training:counter:${guildId}`;
const activeRidealongsKey = (guildId) => `leo:training:active-ridealongs:${guildId}`;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireDb(client) {
  if (!client?.db?.get || !client?.db?.set) throw new Error('Database is unavailable.');
}

async function nextRecordId(client, guildId) {
  requireDb(client);
  const current = Math.max(0, Number(await client.db.get(counterKey(guildId), 0)) || 0);
  const next = current + 1;
  await client.db.set(counterKey(guildId), next);
  return next;
}

export async function getTrainingRecords(client, guildId) {
  requireDb(client);
  return asObject(await client.db.get(recordsKey(guildId), {}));
}

export async function getActiveRidealongs(client, guildId) {
  requireDb(client);
  return asObject(await client.db.get(activeRidealongsKey(guildId), {}));
}

export async function addTrainingResult(client, guildId, data) {
  requireDb(client);
  if (!['passed', 'failed'].includes(data.result)) throw new Error('Invalid training result.');

  const records = await getTrainingRecords(client, guildId);
  const id = await nextRecordId(client, guildId);
  const now = Date.now();
  const record = {
    id,
    kind: 'training',
    traineeId: String(data.traineeId),
    trainerId: String(data.trainerId),
    program: String(data.program || 'General Training').trim().slice(0, 100),
    result: data.result,
    notes: data.notes ? String(data.notes).trim().slice(0, 1000) : null,
    startedAt: null,
    completedAt: now,
    createdAt: now,
  };
  records[String(id)] = record;
  await client.db.set(recordsKey(guildId), records);
  return record;
}

export async function startRidealong(client, guildId, traineeId, trainerId, notes = null) {
  requireDb(client);
  const active = await getActiveRidealongs(client, guildId);
  const traineeKey = String(traineeId);
  if (active[traineeKey]) {
    const records = await getTrainingRecords(client, guildId);
    return { ok: false, reason: 'already_active', record: records[String(active[traineeKey])] || null };
  }

  const records = await getTrainingRecords(client, guildId);
  const id = await nextRecordId(client, guildId);
  const now = Date.now();
  const record = {
    id,
    kind: 'ridealong',
    traineeId: traineeKey,
    trainerId: String(trainerId),
    program: 'Ride Along',
    result: 'in_progress',
    notes: notes ? String(notes).trim().slice(0, 1000) : null,
    completionNotes: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
  };
  records[String(id)] = record;
  active[traineeKey] = id;
  await client.db.set(recordsKey(guildId), records);
  await client.db.set(activeRidealongsKey(guildId), active);
  return { ok: true, record };
}

export async function completeRidealong(client, guildId, traineeId, trainerId, result, notes = null) {
  requireDb(client);
  if (!['passed', 'failed'].includes(result)) return { ok: false, reason: 'invalid_result' };

  const active = await getActiveRidealongs(client, guildId);
  const traineeKey = String(traineeId);
  const recordId = active[traineeKey];
  if (!recordId) return { ok: false, reason: 'not_active' };

  const records = await getTrainingRecords(client, guildId);
  const existing = records[String(recordId)];
  if (!existing) {
    delete active[traineeKey];
    await client.db.set(activeRidealongsKey(guildId), active);
    return { ok: false, reason: 'not_found' };
  }

  const completedAt = Date.now();
  const record = {
    ...existing,
    result,
    completedBy: String(trainerId),
    completionNotes: notes ? String(notes).trim().slice(0, 1000) : null,
    completedAt,
  };
  records[String(recordId)] = record;
  delete active[traineeKey];
  await client.db.set(recordsKey(guildId), records);
  await client.db.set(activeRidealongsKey(guildId), active);
  return { ok: true, record };
}

export async function getTrainingHistory(client, guildId, traineeId, limit = 10) {
  const records = await getTrainingRecords(client, guildId);
  return Object.values(records)
    .filter((record) => String(record.traineeId) === String(traineeId))
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    .slice(0, Math.max(1, Math.min(25, Number(limit) || 10)));
}

export async function getActiveRidealongForUser(client, guildId, traineeId) {
  const active = await getActiveRidealongs(client, guildId);
  const id = active[String(traineeId)];
  if (!id) return null;
  const records = await getTrainingRecords(client, guildId);
  return records[String(id)] || null;
}
