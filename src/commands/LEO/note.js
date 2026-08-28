import { SlashCommandBuilder } from 'discord.js';
import { replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Save a personal note only you can see')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('text').setDescription('Note text').setRequired(true).setMaxLength(1000)),
  async execute(interaction, config, client) {
    const key = `leo:notes:${interaction.guildId}:${interaction.user.id}`;
    const notes = await client.db.get(key, []);
    const list = Array.isArray(notes) ? notes : [];
    list.push({ text: interaction.options.getString('text', true), createdAt: new Date().toISOString() });
    if (list.length > 50) list.splice(0, list.length - 50);
    await client.db.set(key, list);
    await replySuccess(interaction, 'Note Saved', `Saved note #${list.length}.`);
  },
};
