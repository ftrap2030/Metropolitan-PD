const caseKey = (guildId) => `leo:hr:${guildId}:cases`;
const counterKey = (guildId) => `leo:hr:${guildId}:counter`;

export const INFRACTION_TYPES = {
  W1: { label: 'Warning 1', roleKey: 'w1RoleId' },
  W2: { label: 'Warning 2', roleKey: 'w2RoleId' },
  S1: { label: 'Strike 1', roleKey: 's1RoleId' },
  S2: { label: 'Strike 2', roleKey: 's2RoleId' },
  SUSPENSION: { label: 'Suspension', roleKey: 'suspensionRoleId' },
  TERMINATION: { label: 'Termination', roleKey: 'termRoleId' },
  RETIREMENT: { label: 'Retirement', roleKey: 'termRoleId' },
  ACTIVITY_WATCH: { label: 'Activity Watch', roleKey: 'activityWatchRoleId' },
};

export function normalizeInfractionType(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return INFRACTION_TYPES[normalized] ? normalized : null;
}

export function getInfractionRoleId(leoConfig, type) {
  const normalized = normalizeInfractionType(type);
  if (!normalized) return null;
  return leoConfig?.[INFRACTION_TYPES[normalized].roleKey] || null;
}

export async function getHrCases(client, guildId) {
  const value = await client.db.get(caseKey(guildId), {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function getHrCase(client, guildId, caseId) {
  const cases = await getHrCases(client, guildId);
  return cases[String(caseId)] || null;
}

export async function createHrCase(client, guildId, data) {
  const current = Number(await client.db.get(counterKey(guildId), 0)) || 0;
  const next = current + 1;
  await client.db.set(counterKey(guildId), next);
  const id = String(next).padStart(4, '0');
  const cases = await getHrCases(client, guildId);
  const record = {
    id,
    guildId,
    status: 'active',
    notes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...data,
  };
  cases[id] = record;
  await client.db.set(caseKey(guildId), cases);
  return record;
}

export async function updateHrCase(client, guildId, caseId, patch) {
  const cases = await getHrCases(client, guildId);
  const id = String(caseId);
  if (!cases[id]) return null;
  cases[id] = {
    ...cases[id],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await client.db.set(caseKey(guildId), cases);
  return cases[id];
}

export async function addHrCaseNote(client, guildId, caseId, note) {
  const existing = await getHrCase(client, guildId, caseId);
  if (!existing) return null;
  const notes = Array.isArray(existing.notes) ? [...existing.notes] : [];
  notes.push({
    text: String(note.text || '').slice(0, 1500),
    authorId: String(note.authorId),
    createdAt: new Date().toISOString(),
  });
  return updateHrCase(client, guildId, caseId, { notes });
}

export async function getUserHrCases(client, guildId, userId) {
  const cases = await getHrCases(client, guildId);
  return Object.values(cases)
    .filter((record) => record.targetId === String(userId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function formatHrCase(record) {
  if (!record) return 'Unknown case';
  const action = record.kind === 'promotion'
    ? `Promotion → <@&${record.newRankRoleId}>`
    : `${INFRACTION_TYPES[record.type]?.label || record.type || 'Infraction'}`;
  return `**Case #${record.id}** — ${action}\nTarget: <@${record.targetId}>\nBy: <@${record.staffId}>\nReason: ${record.reason || 'No reason provided'}\nStatus: ${record.status || 'active'}`;
}
