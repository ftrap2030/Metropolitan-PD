import { SlashCommandBuilder } from 'discord.js';
import { requireBotOwner, replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('setname')
    .setDescription("Change the bot's nickname in this server; empty resets it")
    .setDMPermission(false)
    .addStringOption((o) => o.setName('nickname').setDescription('New server nickname; omit to reset').setMaxLength(32)),
  async execute(interaction, config, client) {
    if (!(await requireBotOwner(interaction, client))) return;
    const nickname = interaction.options.getString('nickname');
    await interaction.guild.members.me.setNickname(nickname || null, `Changed by ${interaction.user.tag}`);
    await replySuccess(interaction, 'Bot Nickname Updated', nickname ? `Nickname changed to **${nickname}**.` : 'Server nickname reset to the bot account name.');
  },
};
