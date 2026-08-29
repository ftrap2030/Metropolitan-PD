import { AuditLogEvent, Events } from 'discord.js';
import { getLeoGuildConfig } from '../services/leo/leoState.js';
import { sendLeoSecurityAlert } from '../services/leo/securityAlerts.js';
import { logger } from '../utils/logger.js';

const activity = new Map();
const WINDOW_MS = 10_000;
const THRESHOLD = 4;

function record(key) {
  const now = Date.now();
  const values = (activity.get(key) || []).filter((time) => now - time <= WINDOW_MS);
  values.push(now);
  activity.set(key, values);
  return values.length;
}

export default {
  name: Events.ChannelCreate,
  once: false,
  async execute(channel, client) {
    try {
      const guild = channel.guild;
      if (!guild) return;
      const leo = await getLeoGuildConfig(client, guild.id);
      if (!leo.raidProtect) return;

      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 5 }).catch(() => null);
      const entry = logs?.entries?.find((item) => item.target?.id === channel.id && Date.now() - item.createdTimestamp < 7000);
      const executorId = entry?.executor?.id;
      if (!executorId || executorId === client.user.id || executorId === guild.ownerId) return;

      const count = record(`${guild.id}:${executorId}:create`);
      if (count < THRESHOLD) return;

      await channel.delete('LEO raid protection: mass channel creation').catch(() => {});
      const member = await guild.members.fetch(executorId).catch(() => null);
      if (member?.moderatable) await member.timeout(30 * 60 * 1000, 'LEO raid protection: mass channel creation').catch(() => {});
      await sendLeoSecurityAlert(
        client,
        guild,
        leo,
        `LEO raid protection detected mass channel creation by <@${executorId}> (${executorId}). The newest channel was deleted and the actor was timed out when possible.`,
        { dmSecurityUsers: true },
      );
      activity.delete(`${guild.id}:${executorId}:create`);
    } catch (error) {
      logger.warn('LEO channel-create raid protection error:', error);
    }
  },
};
