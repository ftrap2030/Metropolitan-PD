import { SlashCommandBuilder } from 'discord.js';
import { formatDuration, getShiftSummary } from '../../services/leo/departmentManagementService.js';
import { replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('Show a member’s current duty status')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member to check').setRequired(false)),
  async execute(interaction, config, client) {
    const target = interaction.options.getUser('user') || interaction.user;
    const summary = await getShiftSummary(client, interaction.guildId, target.id);
    const fields = [
      { name: 'Status', value: summary.active ? 'On Duty' : 'Off Duty', inline: true },
      { name: 'Current Shift', value: summary.active ? formatDuration(summary.ongoingMs) : '—', inline: true },
      { name: 'Lifetime Duty Time', value: formatDuration(summary.totalWithCurrentMs), inline: true },
    ];
    if (summary.active && summary.startedAt) {
      fields.push({ name: 'Started', value: `<t:${Math.floor(summary.startedAt / 1000)}:F>`, inline: false });
    }
    await replyInfo(interaction, `Shift Status — ${target.username}`, `${target} duty information.`, false, fields);
  },
};
