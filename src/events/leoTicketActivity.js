import { Events } from 'discord.js';
import { getTicketData, saveTicketData } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    try {
      if (!message.guild || message.author?.bot || !message.channel?.id) return;
      if (!String(message.channel.name || '').includes('ticket-')) return;
      const ticket = await getTicketData(message.guild.id, message.channel.id);
      if (!ticket || ticket.status !== 'open') return;
      await saveTicketData(message.guild.id, message.channel.id, {
        ...ticket,
        lastActivityAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.debug('Could not update LEO ticket activity timestamp:', error);
    }
  },
};
