import { SlashCommandBuilder } from 'discord.js';
import { setServerWhitelisted } from '../../services/leo/leoState.js';
import { requireSlashLevel, replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('unwhitelist-server')
    .setDescription("Revoke a server ID's authorization to use this bot")
    .setDMPermission(false)
    .addStringOption((o) => o.setName('server_id').setDescription('Discord server ID').setRequired(true).setMinLength(15).setMaxLength(22)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const guildId = interaction.options.getString('server_id', true).trim();
    if (!/^\d{15,22}$/.test(guildId)) return interaction.reply({ content: 'Provide a valid Discord server ID.', ephemeral: true });
    await setServerWhitelisted(client, guildId, false, { setBy: interaction.user.id });
    await replySuccess(interaction, 'Server Authorization Revoked', `Server \`${guildId}\` was removed from the whitelist.`);
  },
};
