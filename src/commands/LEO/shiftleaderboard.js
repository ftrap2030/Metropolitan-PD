import { SlashCommandBuilder } from 'discord.js';
import { formatDuration, getShiftLeaderboard } from '../../services/leo/departmentManagementService.js';
import { replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('shiftleaderboard')
    .setDescription('Show the server duty-time leaderboard')
    .setDMPermission(false),
  async execute(interaction, config, client) {
    const rows = await getShiftLeaderboard(client, interaction.guildId, 10);
    const description = rows.length
      ? rows.map((entry, index) => `${index + 1}. <@${entry.userId}> — **${formatDuration(entry.totalMs)}**${entry.active ? ' — On Duty' : ''}`).join('\n')
      : 'No shift data has been recorded yet.';
    await replyInfo(interaction, 'Shift Leaderboard', description, false);
  },
};
