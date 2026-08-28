import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig, patchLeoGuildConfig } from '../../services/leo/leoState.js';
import { requireSlashLevel, replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Set or clear a custom LEO banner image')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('type').setDescription('Banner type').setRequired(true).addChoices(
      { name: 'Promotion', value: 'promotion' },
      { name: 'Infraction', value: 'infraction' },
      { name: 'Ticket Panel', value: 'ticketpanel' },
      { name: 'Welcome', value: 'welcome' },
    ))
    .addAttachmentOption((o) => o.setName('image').setDescription('Image to use; omit to clear')),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const type = interaction.options.getString('type', true);
    const image = interaction.options.getAttachment('image');
    if (image && !String(image.contentType || '').startsWith('image/')) {
      await interaction.reply({ content: 'The attachment must be an image.', ephemeral: true });
      return;
    }
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const banners = { ...(leo.banners || {}) };
    if (image) banners[type] = image.url;
    else delete banners[type];
    await patchLeoGuildConfig(client, interaction.guildId, { banners });
    await replySuccess(interaction, 'Banner Updated', image ? `The **${type}** banner was updated.` : `The **${type}** banner was cleared.`);
  },
};
