import axios from 'axios';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { requireBotOwner, replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('setavatar')
    .setDescription("Change the bot's server avatar; empty resets to the global avatar")
    .setDMPermission(false)
    .addAttachmentOption((o) => o.setName('image').setDescription('PNG/JPEG/WebP image; omit to reset')),
  async execute(interaction, config, client) {
    if (!(await requireBotOwner(interaction, client))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const image = interaction.options.getAttachment('image');
    let avatar = null;
    if (image) {
      if (!String(image.contentType || '').startsWith('image/')) {
        await interaction.editReply('The attachment must be an image.');
        return;
      }
      const response = await axios.get(image.url, { responseType: 'arraybuffer', timeout: 15000 });
      const mime = image.contentType || 'image/png';
      avatar = `data:${mime};base64,${Buffer.from(response.data).toString('base64')}`;
    }
    try {
      await client.rest.patch(`/guilds/${interaction.guildId}/members/@me`, { body: { avatar } });
      await replySuccess(interaction, 'Server Avatar Updated', image ? 'The bot server avatar was updated.' : 'The server avatar was reset to the global bot avatar.');
    } catch (error) {
      await interaction.editReply(`Discord rejected the server-avatar change: ${error.message}`);
    }
  },
};
