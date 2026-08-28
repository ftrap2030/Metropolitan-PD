import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig, patchLeoGuildConfig } from '../../services/leo/leoState.js';
import { requireSlashLevel, replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('ranklimit')
    .setDescription('Set or clear the maximum number of members allowed to hold a role')
    .setDMPermission(false)
    .addRoleOption((o) => o.setName('role').setDescription('Rank role').setRequired(true))
    .addIntegerOption((o) => o.setName('limit').setDescription('Maximum holders; omit to clear').setMinValue(1).setMaxValue(1000)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const role = interaction.options.getRole('role', true);
    const limit = interaction.options.getInteger('limit');
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const rankLimits = { ...(leo.rankLimits || {}) };
    if (limit == null) delete rankLimits[role.id];
    else rankLimits[role.id] = limit;
    await patchLeoGuildConfig(client, interaction.guildId, { rankLimits });
    await replySuccess(interaction, 'Rank Limit Updated', limit == null ? `The limit for ${role} was cleared.` : `${role} is now limited to **${limit}** member(s).`);
  },
};
