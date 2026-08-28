import { SlashCommandBuilder } from 'discord.js';
import { replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('listnote')
    .setDescription('Show your own saved personal notes')
    .setDMPermission(false),
  async execute(interaction, config, client) {
    const key = `leo:notes:${interaction.guildId}:${interaction.user.id}`;
    const notes = await client.db.get(key, []);
    const list = Array.isArray(notes) ? notes : [];
    const description = list.length
      ? list.slice(-20).map((note, index) => `**${Math.max(1, list.length - 19) + index}.** ${note.text}`).join('\n')
      : 'You have no saved notes.';
    await replyInfo(interaction, `Your Notes (${list.length})`, description);
  },
};
