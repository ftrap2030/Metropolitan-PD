import { SlashCommandBuilder } from 'discord.js';
import { formatDuration, getShiftSummary } from '../../services/leo/departmentManagementService.js';
import { replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('shiftstats')
    .setDescription('Show detailed duty statistics for a member')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member to check').setRequired(false)),
  async execute(interaction, config, client) {
    const target = interaction.options.getUser('user') || interaction.user;
    const summary = await getShiftSummary(client, interaction.guildId, target.id);
    const fields = [
      { name: 'Completed Shifts', value: String(summary.shiftsCompleted), inline: true },
      { name: 'Recorded Time', value: formatDuration(summary.totalMs), inline: true },
      { name: 'Including Current Shift', value: formatDuration(summary.totalWithCurrentMs), inline: true },
      { name: 'Current Status', value: summary.active ? 'On Duty' : 'Off Duty', inline: true },
      { name: 'Last Shift Start', value: summary.lastStart ? `<t:${Math.floor(summary.lastStart / 1000)}:F>` : 'No completed shifts', inline: false },
      { name: 'Last Shift End', value: summary.lastEnd ? `<t:${Math.floor(summary.lastEnd / 1000)}:F>` : 'No completed shifts', inline: false },
    ];
    await replyInfo(interaction, `Shift Statistics — ${target.username}`, `${target} duty history.`, false, fields);
  },
};
