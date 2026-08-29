import { SlashCommandBuilder } from 'discord.js';
import { getUserCertifications } from '../../services/leo/staffOperationsService.js';
import { replyInfo, requireSlashLevel } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('certifications')
    .setDescription('View a staff member’s active certifications')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const user = interaction.options.getUser('user', true);
    const records = await getUserCertifications(client, interaction.guildId, user.id);
    const description = records.length
      ? records.map((record) => `**#${record.id} — ${record.certification}**\nIssued by: <@${record.issuedBy}> • <t:${Math.floor(record.issuedAt / 1000)}:d>${record.expiresOn ? `\nExpires: **${record.expiresOn}**` : ''}${record.notes ? `\nNotes: ${record.notes}` : ''}`).join('\n\n')
      : `${user} has no active certifications.`;
    await replyInfo(interaction, `Certifications — ${user.username}`, description, true);
  },
};
