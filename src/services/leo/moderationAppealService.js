const appealsKey = (guildId) => `leo:moderation:${guildId}:appeals`;
const counterKey = (guildId) => `leo:moderation:${guildId}:appealCounter`;

export async function getModerationAppeals(client, guildId) {
  const value = await client.db.get(appealsKey(guildId), {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function getModerationAppeal(client, guildId, appealId) {
  const appeals = await getModerationAppeals(client, guildId);
  return appeals[String(appealId)] || null;
}

export async function createModerationAppeal(client, guildId, data) {
  const current = Number(await client.db.get(counterKey(guildId), 0)) || 0;
  const next = current + 1;
  await client.db.set(counterKey(guildId), next);
  const id = String(next).padStart(4, '0');
  const appeals = await getModerationAppeals(client, guildId);
  const record = {
    id,
    guildId: String(guildId),
    status: 'available',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...data,
  };
  appeals[id] = record;
  await client.db.set(appealsKey(guildId), appeals);
  return record;
}

export async function updateModerationAppeal(client, guildId, appealId, patch) {
  const appeals = await getModerationAppeals(client, guildId);
  const id = String(appealId);
  if (!appeals[id]) return null;
  appeals[id] = {
    ...appeals[id],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await client.db.set(appealsKey(guildId), appeals);
  return appeals[id];
}
