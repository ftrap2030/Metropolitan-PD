import { SlashCommandBuilder } from 'discord.js';
import { getSessionHistory } from '../../services/leo/staffOperationsService.js';
import { formatDuration } from '../../services/leo/departmentManagementService.js';
import { replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('sessionhistory')
    .setDescription('Show recent patrol sessions')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('limit').setDescription('Sessions to show').setRequired(false).setMinValue(1).setMaxValue(20)),
  async execute(interaction, config, client) {
    const limit = interaction.options.getInteger('limit', false) || 10;
    const records = await getSessionHistory(client, interaction.guildId, limit);
    const description = records.length
      ? records.map((record) => {
        const duration = record.endedAt ? formatDuration(Number(record.endedAt) - Number(record.startedAt)) : 'Active';
        return `**#${record.id} — ${record.name}**\nHost: <@${record.hostId}> • <t:${Math.floor(record.startedAt / 1000)}:d> • **${duration}**`;
      }).join('\n\n')
      : 'No patrol sessions have been recorded yet.';
    await replyInfo(interaction, 'Patrol Session History', description, true);
  },
};
