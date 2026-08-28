import { SlashCommandBuilder } from 'discord.js';
import embedBuilder from '../Tools/embedbuilder.js';
import { requireSlashLevel } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  slashOnly: true,
  data: new SlashCommandBuilder()
    .setName('embedv2')
    .setDescription('Open the Components V2-style interactive embed builder')
    .setDMPermission(false),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    return embedBuilder.execute(interaction, config, client);
  },
};
