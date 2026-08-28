import { SlashCommandBuilder } from 'discord.js';
import { getBotOwners } from '../../config/bot.js';
import { createEmbed } from '../../utils/embeds.js';
import { replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Send a question or request to the bot owner')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('question').setDescription('Question or request').setRequired(true).setMaxLength(1500)),
  async execute(interaction, config, client) {
    const question = interaction.options.getString('question', true);
    const owners = getBotOwners();
    let sent = 0;
    for (const ownerId of owners) {
      const owner = await client.users.fetch(ownerId).catch(() => null);
      if (!owner) continue;
      const ok = await owner.send({
        embeds: [createEmbed({
          title: 'Owner Request',
          description: question,
          color: 'info',
          fields: [
            { name: 'From', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
            { name: 'Server', value: `${interaction.guild.name} (${interaction.guildId})`, inline: false },
          ],
        })],
      }).then(() => true).catch(() => false);
      if (ok) sent += 1;
    }
    await replySuccess(interaction, 'Request Sent', sent ? `Your request was sent to ${sent} configured owner account(s).` : 'The request was saved, but no configured owner account could be DMed.');
    if (!sent) await client.db.set(`leo:ownerrequests:${interaction.guildId}:${Date.now()}`, { userId: interaction.user.id, question, createdAt: new Date().toISOString() });
  },
};
