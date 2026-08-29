import { SlashCommandBuilder } from 'discord.js';
import { requireSlashLevel, replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('setserverbio')
    .setDescription("Change this server's description (Community servers only)")
    .setDMPermission(false)
    .addStringOption((o) => o.setName('text').setDescription('New server description').setRequired(true).setMaxLength(120)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const text = interaction.options.getString('text', true);
    await interaction.guild.edit({ description: text, reason: `Server bio changed by ${interaction.user.tag}` });
    await replySuccess(interaction, 'Server Description Updated', text);
  },
};
