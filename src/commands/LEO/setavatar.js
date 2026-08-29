import axios from 'axios';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { requireBotOwner, replySuccess } from '../../services/leo/slashUtils.js';

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('setavatar')
    .setDescription("Change the bot's server avatar; empty resets to the global avatar")
    .setDMPermission(false)
    .addAttachmentOption((o) => o.setName('image').setDescription('PNG/JPEG/WebP/GIF image; omit to reset')),
  async execute(interaction, config, client) {
    if (!(await requireBotOwner(interaction, client))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const image = interaction.options.getAttachment('image');
    let avatar = null;
    if (image) {
      const mime = String(image.contentType || '').toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(mime)) {
        await interaction.editReply('The attachment must be a PNG, JPEG, WebP, or GIF image.');
        return;
      }
      if (Number(image.size || 0) > MAX_AVATAR_BYTES) {
        await interaction.editReply('The image is larger than 10 MiB. Please use a smaller image.');
        return;
      }

      const response = await axios.get(image.url, {
        responseType: 'arraybuffer',
        timeout: 15_000,
        maxContentLength: MAX_AVATAR_BYTES,
        maxBodyLength: MAX_AVATAR_BYTES,
      });
      const buffer = Buffer.from(response.data);
      if (buffer.length > MAX_AVATAR_BYTES) {
        await interaction.editReply('The downloaded image is larger than 10 MiB. Please use a smaller image.');
        return;
      }
      avatar = `data:${mime};base64,${buffer.toString('base64')}`;
    }

    try {
      // Discord's Modify Current Member endpoint supports guild-specific avatar data
      // for bot users. `avatar: null` resets to the bot's global avatar.
      await client.rest.patch(`/guilds/${interaction.guildId}/members/@me`, { body: { avatar } });
      await replySuccess(
        interaction,
        'Server Avatar Updated',
        image ? 'The bot server avatar was updated.' : 'The server avatar was reset to the global bot avatar.',
      );
    } catch (error) {
      const apiMessage = error.rawError?.message || error.message;
      await interaction.editReply(`Discord rejected the server-avatar change: ${apiMessage}`);
    }
  },
};
