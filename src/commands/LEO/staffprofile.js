import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig, isProtectedUser } from '../../services/leo/leoState.js';
import { getCallsigns, getLoaRecords, getShiftSummary, formatDuration } from '../../services/leo/departmentManagementService.js';
import { getTrainingHistory, getActiveRidealongForUser } from '../../services/leo/trainingService.js';
import { getUserHrCases } from '../../services/leo/hrService.js';
import { getUserCertifications } from '../../services/leo/staffOperationsService.js';
import { replyInfo, requireSlashLevel } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('staffprofile')
    .setDescription('Show a consolidated staff management profile')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Staff member to view').setRequired(false)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'rolemanager'))) return;
    const user = interaction.options.getUser('user', false) || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: 'That user is not currently in this server.', ephemeral: true }).catch(() => {});
      return;
    }

    const [leo, callsigns, shift, loaRecords, training, ridealong, hrCases, certifications] = await Promise.all([
      getLeoGuildConfig(client, interaction.guildId),
      getCallsigns(client, interaction.guildId),
      getShiftSummary(client, interaction.guildId, user.id),
      getLoaRecords(client, interaction.guildId),
      getTrainingHistory(client, interaction.guildId, user.id, 25),
      getActiveRidealongForUser(client, interaction.guildId, user.id),
      getUserHrCases(client, interaction.guildId, user.id),
      getUserCertifications(client, interaction.guildId, user.id),
    ]);

    const activeLoa = Object.values(loaRecords)
      .filter((record) => String(record.userId) === user.id && ['pending', 'approved'].includes(record.status))
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] || null;
    const passed = training.filter((record) => record.result === 'passed').length;
    const failed = training.filter((record) => record.result === 'failed').length;
    const activeHr = hrCases.filter((record) => record.status === 'active').length;
    const highest = member.roles.highest?.id === interaction.guild.id ? 'No staff role' : `<@&${member.roles.highest.id}>`;
    const callsign = callsigns[user.id] || 'Not assigned';

    const fields = [
      { name: 'Identity', value: `User: ${user}\nCallsign: **${callsign}**\nHighest role: ${highest}`, inline: false },
      { name: 'Duty', value: `Status: **${shift.active ? 'On Duty' : 'Off Duty'}**\nLifetime: **${formatDuration(shift.totalWithCurrentMs)}**\nCompleted shifts: **${shift.shiftsCompleted}**`, inline: true },
      { name: 'Training', value: `Passed: **${passed}**\nFailed: **${failed}**\nActive ride-along: **${ridealong ? `#${ridealong.id}` : 'None'}**`, inline: true },
      { name: 'LOA', value: activeLoa ? `**${String(activeLoa.status).toUpperCase()}** — #${activeLoa.id}\nReturn: ${activeLoa.returnDate}` : '**None**', inline: true },
      { name: 'Management', value: `Active HR cases: **${activeHr}**\nActive certifications: **${certifications.length}**\nProtected: **${isProtectedUser(leo, user.id) ? 'Yes' : 'No'}**`, inline: false },
    ];

    await replyInfo(interaction, `Staff Profile — ${member.displayName}`, `Discord ID: \`${user.id}\``, true, fields);
  },
};
