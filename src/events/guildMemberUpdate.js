import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { findAuditExecutor, executorLines } from '../services/leo/comprehensiveAuditService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;

      if (oldMember.nickname !== newMember.nickname) {
        const executor = await findAuditExecutor(newMember.guild, 24, newMember.id);
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            title: 'Nickname changed',
            lines: [
              `**User:** ${newMember.user.toString()} (${newMember.user.tag})`,
              `**ID:** \`${newMember.user.id}\``,
              `**Before:** ${oldMember.nickname || '*(no nickname)*'}`,
              `**After:** ${newMember.nickname || '*(no nickname)*'}`,
              ...executorLines(executor),
            ],
            thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
            userId: newMember.user.id,
          }
        });
      }

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
};
