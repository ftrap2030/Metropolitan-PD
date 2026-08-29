import { getGuildConfig, setGuildConfig } from '../config/guildConfig.js';

const GLOBAL_KEYS = {
  bypass: 'leo:global:bypass',
  botBlacklist: 'leo:global:botblacklist',
  dmLog: 'leo:global:dmlog',
  globalBlacklist: 'leo:global:blacklist',
  serverWhitelist: 'leo:global:serverwhitelist',
};

function deepMerge(base = {}, patch = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base?.[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function getLeoGuildConfig(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  return config?.leo && typeof config.leo === 'object' ? config.leo : {};
}

export async function patchLeoGuildConfig(client, guildId, patch) {
  const config = await getGuildConfig(client, guildId);
  const currentLeo = config?.leo && typeof config.leo === 'object' ? config.leo : {};
  const next = {
    ...config,
    leo: deepMerge(currentLeo, patch || {}),
  };
  await setGuildConfig(client, guildId, next);
  return next.leo;
}

async function getGlobalObject(client, key) {
  if (!client?.db?.get) return {};
  const value = await client.db.get(key, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function setGlobalObject(client, key, value) {
  if (!client?.db?.set) return false;
  await client.db.set(key, value);
  return true;
}

export async function getBypassMap(client) {
  return getGlobalObject(client, GLOBAL_KEYS.bypass);
}

export async function isLeoBypassed(client, userId) {
  if (!userId) return false;
  const map = await getBypassMap(client);
  return Boolean(map[String(userId)]);
}

export async function setLeoBypass(client, userId, enabled, metadata = {}) {
  const map = await getBypassMap(client);
  const id = String(userId);
  if (enabled) map[id] = { enabled: true, ...metadata, updatedAt: new Date().toISOString() };
  else delete map[id];
  await setGlobalObject(client, GLOBAL_KEYS.bypass, map);
  return map;
}

export async function getBotBlacklist(client) {
  return getGlobalObject(client, GLOBAL_KEYS.botBlacklist);
}

export async function isBotBlacklisted(client, userId) {
  if (!userId) return false;
  const map = await getBotBlacklist(client);
  return Boolean(map[String(userId)]);
}

export async function setBotBlacklist(client, userId, enabled, metadata = {}) {
  const map = await getBotBlacklist(client);
  const id = String(userId);
  if (enabled) map[id] = { ...metadata, updatedAt: new Date().toISOString() };
  else delete map[id];
  await setGlobalObject(client, GLOBAL_KEYS.botBlacklist, map);
  return map;
}

export async function getDmLogUsers(client) {
  return getGlobalObject(client, GLOBAL_KEYS.dmLog);
}

export async function setDmLogUser(client, userId, enabled, metadata = {}) {
  const map = await getDmLogUsers(client);
  const id = String(userId);
  if (enabled) map[id] = { ...metadata, updatedAt: new Date().toISOString() };
  else delete map[id];
  await setGlobalObject(client, GLOBAL_KEYS.dmLog, map);
  return map;
}

export async function getGlobalBlacklist(client) {
  return getGlobalObject(client, GLOBAL_KEYS.globalBlacklist);
}

export async function isGloballyBlacklisted(client, userId) {
  if (!userId) return false;
  const map = await getGlobalBlacklist(client);
  return Boolean(map[String(userId)]);
}

export async function setGlobalBlacklist(client, userId, enabled, metadata = {}) {
  const map = await getGlobalBlacklist(client);
  const id = String(userId);
  if (enabled) map[id] = { ...metadata, updatedAt: new Date().toISOString() };
  else delete map[id];
  await setGlobalObject(client, GLOBAL_KEYS.globalBlacklist, map);
  return map;
}

export async function getServerWhitelist(client) {
  return getGlobalObject(client, GLOBAL_KEYS.serverWhitelist);
}

export async function setServerWhitelisted(client, guildId, enabled, metadata = {}) {
  const map = await getServerWhitelist(client);
  const id = String(guildId);
  if (enabled) map[id] = { ...metadata, updatedAt: new Date().toISOString() };
  else delete map[id];
  await setGlobalObject(client, GLOBAL_KEYS.serverWhitelist, map);
  return map;
}

export async function isServerAuthorized(client, guildId) {
  if (!guildId) return false;
  const map = await getServerWhitelist(client);
  const ids = Object.keys(map);
  // Backward compatible: whitelist enforcement begins after at least one server is added.
  if (ids.length === 0) return true;
  return Boolean(map[String(guildId)]);
}

export function isProtectedUser(leoConfig, userId) {
  return Boolean(userId && Array.isArray(leoConfig?.protectedUsers) && leoConfig.protectedUsers.includes(String(userId)));
}

export async function setProtectedUser(client, guildId, userId, enabled) {
  const leo = await getLeoGuildConfig(client, guildId);
  const current = new Set((leo.protectedUsers || []).map(String));
  const id = String(userId);
  if (enabled) current.add(id);
  else current.delete(id);
  return patchLeoGuildConfig(client, guildId, { protectedUsers: [...current] });
}

export const LEO_GLOBAL_KEYS = GLOBAL_KEYS;
