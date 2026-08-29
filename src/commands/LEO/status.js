import axios from 'axios';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show live ER:LC private-server status')
    .setDMPermission(false),
  async execute(interaction, config, client) {
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    if (!leo.erlcServerKey) {
      await interaction.reply({ content: 'The ER:LC server key has not been configured yet.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    try {
      const response = await axios.get('https://api.erlc.gg/v2/server', {
        headers: { 'server-key': leo.erlcServerKey },
        timeout: 10000,
      });
      const data = response.data || {};
      const fields = [
        { name: 'Server', value: String(data.Name ?? data.name ?? interaction.guild.name), inline: true },
        { name: 'Players', value: String(data.CurrentPlayers ?? data.currentPlayers ?? data.players ?? 'Unknown'), inline: true },
        { name: 'Max Players', value: String(data.MaxPlayers ?? data.maxPlayers ?? 'Unknown'), inline: true },
      ];
      if (data.JoinKey ?? data.joinKey) fields.push({ name: 'Join Key', value: String(data.JoinKey ?? data.joinKey), inline: true });
      await replyInfo(interaction, 'ER:LC Server Status', 'Live status from the ER:LC private-server API.', false, fields);
    } catch (error) {
      await interaction.editReply(`Could not fetch ER:LC status${error.response?.status ? ` (HTTP ${error.response.status})` : ''}.`);
    }
  },
};
