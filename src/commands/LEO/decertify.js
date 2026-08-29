import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { revokeCertification } from '../../services/leo/staffOperationsService.js';
import { replySuccess, requireSlashLevel } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('decertify')
    .setDescription('Revoke a staff certification')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('certification').setDescription('Certification name').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('reason').setDescription('Optional revocation reason').setRequired(false).setMaxLength(1000)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const user = interaction.options.getUser('user', true);
    const certification = interaction.options.getString('certification', true).trim();
    const reason = interaction.options.getString('reason', false)?.trim() || null;
    const result = await revokeCertification(client, interaction.guildId, user.id, certification, interaction.user.id, reason);
    if (!result.ok) {
      await interaction.reply({ content: `${user} does not have an active certification named **${certification}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await user.send(`Your **${result.record.certification}** certification in **${interaction.guild.name}** was revoked.${reason ? `\nReason: ${reason}` : ''}`).catch(() => {});
    await replySuccess(interaction, 'Certification Revoked', `Revoked **${result.record.certification}** from ${user}.${reason ? `\nReason: ${reason}` : ''}`, true);
  },
};
