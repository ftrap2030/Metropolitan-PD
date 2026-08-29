import { SlashCommandBuilder } from 'discord.js';
import { getActiveSession } from '../../services/leo/staffOperationsService.js';
import { formatDuration } from '../../services/leo/departmentManagementService.js';
import { requireSessionAccess } from '../../services/leo/staffOperationsAccess.js';
import { replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('session')
    .setDescription('Show the active patrol session')
    .setDMPermission(false),
  async execute(interaction, config, client) {
    if (!(await requireSessionAccess(interaction, client))) return;
    const record = await getActiveSession(client, interaction.guildId);
    if (!record) {
      await replyInfo(interaction, 'Patrol Session', 'There is no active patrol session.', true);
      return;
    }
    const duration = Math.max(0, Date.now() - Number(record.startedAt));
    await replyInfo(
      interaction,
      `Patrol Session #${record.id}`,
      `**${record.name}**\nHost: <@${record.hostId}>\nStarted: <t:${Math.floor(record.startedAt / 1000)}:F>\nRunning for: **${formatDuration(duration)}**`,
      true,
    );
  },
};
