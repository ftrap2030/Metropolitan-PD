import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { issueCertification } from '../../services/leo/staffOperationsService.js';
import { replySuccess, requireSlashLevel } from '../../services/leo/slashUtils.js';

function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T23:59:59Z`);
  return Number.isFinite(parsed) && parsed >= Date.now() - 86_400_000;
}

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('certify')
    .setDescription('Issue a staff certification')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('certification').setDescription('Certification name').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('expires').setDescription('Optional expiration date YYYY-MM-DD').setRequired(false).setMaxLength(10))
    .addStringOption((o) => o.setName('notes').setDescription('Optional notes').setRequired(false).setMaxLength(1000)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const user = interaction.options.getUser('user', true);
    const certification = interaction.options.getString('certification', true).trim();
    const expiresOn = interaction.options.getString('expires', false)?.trim() || null;
    const notes = interaction.options.getString('notes', false)?.trim() || null;
    if (!validDate(expiresOn)) {
      await interaction.reply({ content: 'Expiration must use `YYYY-MM-DD` and cannot be in the past.', flags: MessageFlags.Ephemeral });
      return;
    }
    const result = await issueCertification(client, interaction.guildId, {
      userId: user.id,
      certification,
      issuedBy: interaction.user.id,
      expiresOn,
      notes,
    });
    if (!result.ok) {
      await interaction.reply({
        content: result.reason === 'duplicate' ? `${user} already has an active **${result.record.certification}** certification.` : 'Could not issue that certification.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await user.send(`You were issued the **${result.record.certification}** certification in **${interaction.guild.name}**.${expiresOn ? `\nExpires: ${expiresOn}` : ''}${notes ? `\nNotes: ${notes}` : ''}`).catch(() => {});
    await replySuccess(interaction, 'Certification Issued', `${user} received **${result.record.certification}**.\nRecord: **#${result.record.id}**${expiresOn ? `\nExpires: **${expiresOn}**` : ''}`, true);
  },
};
