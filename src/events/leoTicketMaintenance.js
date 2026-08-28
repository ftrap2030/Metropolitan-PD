import { Events } from 'discord.js';
import { getLeoGuildConfig } from '../services/leo/leoState.js';
import { closeTicket } from '../services/ticket.js';
import { logger } from '../utils/logger.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_INACTIVITY_MS = 24 * 60 * 60 * 1000;

async function checkInactiveTickets(client) {
  if (!client?.db?.list) return;
  for (const guild of client.guilds.cache.values()) {
    try {
      const leo = await getLeoGuildConfig(client, guild.id);
      if (!leo.ticketInactivity) continue;
      const maxAgeMs = Math.max(1, Number(leo.ticketInactivityHours || 24)) * 60 * 60 * 1000;
      const keys = await client.db.list(`guild:${guild.id}:ticket:`);
      for (const key of keys || []) {
        if (String(key).endsWith(':counter')) continue;
        const ticket = await client.db.get(key, null);
        if (!ticket || ticket.status !== 'open' || !ticket.id) continue;
        const activityTime = Date.parse(ticket.lastActivityAt || ticket.createdAt || 0);
        if (!Number.isFinite(activityTime) || Date.now() - activityTime < (maxAgeMs || DEFAULT_INACTIVITY_MS)) continue;
        const channel = guild.channels.cache.get(ticket.id) || await guild.channels.fetch(ticket.id).catch(() => null);
        if (!channel?.isTextBased?.()) continue;
        await closeTicket(channel, client.user, `Automatically closed after ${leo.ticketInactivityHours || 24} hours of inactivity`);
      }
    } catch (error) {
      logger.warn(`LEO inactive-ticket check failed for guild ${guild.id}:`, error);
    }
  }
}

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const timer = setInterval(() => {
      checkInactiveTickets(client).catch((error) => logger.warn('LEO ticket maintenance failed:', error));
    }, CHECK_INTERVAL_MS);
    if (typeof timer.unref === 'function') timer.unref();

    const initial = setTimeout(() => {
      checkInactiveTickets(client).catch((error) => logger.warn('Initial LEO ticket maintenance failed:', error));
    }, 30_000);
    if (typeof initial.unref === 'function') initial.unref();
  },
};
