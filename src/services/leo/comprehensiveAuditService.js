import { getGuildConfig, updateGuildConfig } from '../config/guildConfig.js';
import { logEvent } from '../loggingService.js';

function truncate(value, max = 900) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function configureUnifiedAuditLog(client, guildId, channelId) {
  const config = await getGuildConfig(client, guildId);
  const logging = {
    ...(config.logging || {}),
    enabled: Boolean(channelId),
    channels: {
      ...(config.logging?.channels || {}),
      audit: channelId || null,
      applications: channelId || null,
      reports: channelId || null,
    },
    // A unified audit log is intentionally an all-events mode.
    enabledEvents: {},
    ignore: { users: [], channels: [] },
  };
  await updateGuildConfig(client, guildId, { logging });
  return logging;
}

export async function getUnifiedAuditStatus(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  const logging = config.logging || {};
  const channels = logging.channels || {};
  const ids = [channels.audit, channels.applications, channels.reports].filter(Boolean).map(String);
  const unified = ids.length === 3 && new Set(ids).size === 1;
  return {
    enabled: Boolean(logging.enabled),
    unified,
    channelId: unified ? ids[0] : channels.audit || null,
  };
}

export async function findAuditExecutor(guild, actionType, targetId = null) {
  if (!guild?.members?.me?.permissions?.has?.('ViewAuditLog')) return null;
  try {
    const logs = await guild.fetchAuditLogs({ type: actionType, limit: 6 });
    const now = Date.now();
    const entry = logs.entries.find((item) => {
      const recent = Math.abs(now - Number(item.createdTimestamp || 0)) <= 15_000;
      if (!recent) return false;
      if (!targetId) return true;
      return String(item.target?.id || item.targetId || '') === String(targetId);
    });
    if (!entry?.executor) return null;
    return {
      id: entry.executor.id,
      tag: entry.executor.tag || entry.executor.username || entry.executor.id,
      reason: entry.reason || null,
    };
  } catch {
    return null;
  }
}

export function executorLines(executor) {
  if (!executor) return [];
  const lines = [`**Performed by:** <@${executor.id}> (${truncate(executor.tag, 120)})`];
  if (executor.reason) lines.push(`**Audit reason:** ${truncate(executor.reason, 500)}`);
  return lines;
}

export async function writeServerAudit({ client, guild, eventType, title, lines = [], userId = null, channelId = null, color = null }) {
  if (!guild?.id || !client) return null;
  return logEvent({
    client,
    guildId: guild.id,
    eventType: `server.${eventType}`,
    data: {
      title,
      lines: lines.map((line) => truncate(line, 1000)),
      quoted: false,
      ...(userId ? { userId: String(userId) } : {}),
      ...(channelId ? { channelId: String(channelId) } : {}),
      ...(color !== null ? { color } : {}),
    },
  });
}

export function changedLines(changes) {
  return changes
    .filter((change) => change.before !== change.after)
    .map((change) => `**${change.label}:** ${truncate(change.before ?? 'None', 350)} → ${truncate(change.after ?? 'None', 350)}`);
}

export function roleList(roles) {
  const values = [...roles].map((role) => `<@&${role.id}>`).slice(0, 25);
  return values.length ? values.join(', ') : 'None';
}
