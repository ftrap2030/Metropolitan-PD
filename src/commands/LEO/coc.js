import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { requireSlashLevel } from '../../services/leo/slashUtils.js';

function buildDescription(leo) {
  const teams = Array.isArray(leo.coc?.teams) ? leo.coc.teams : [];
  if (!teams.length) return 'No teams or ranks are configured yet. Use the buttons below to build the Chain of Command.';
  return teams.map((team) => {
    const ranks = (team.ranks || []).map((rank, index) => `${index + 1}. <@&${rank.roleId}>${rank.limit ? ` — limit ${rank.limit}` : ''}`).join('\n') || '*No ranks*';
    return `**${team.name}**\n${ranks}`;
  }).join('\n\n');
}

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('coc')
    .setDescription('Open the Chain of Command editor')
    .setDMPermission(false),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const embed = createEmbed({ title: 'Chain of Command Editor', description: buildDescription(leo), color: 'info' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`leo_coc:add_team:${interaction.user.id}`).setLabel('Add Team').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`leo_coc:add_rank:${interaction.user.id}`).setLabel('Add Rank').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`leo_coc:remove_team:${interaction.user.id}`).setLabel('Remove Team').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`leo_coc:remove_rank:${interaction.user.id}`).setLabel('Remove Rank').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`leo_coc:done:${interaction.user.id}`).setLabel('Done').setStyle(ButtonStyle.Danger),
    );
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
