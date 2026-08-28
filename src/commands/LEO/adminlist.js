import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { requireSlashLevel, replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('adminlist')
    .setDescription('List every current bot Admin in this server')
    .setDMPermission(false),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const users = (leo.adminUsers || []).map((id) => `<@${id}> — \`${id}\``);
    const roleLine = leo.adminRoleId ? `Configured Admin role: <@&${leo.adminRoleId}>` : 'Configured Admin role: none';
    await replyInfo(interaction, 'Bot Admins', `${roleLine}\n\n${users.length ? users.join('\n') : 'No users have been explicitly added to the Admin tier.'}`);
  },
};
