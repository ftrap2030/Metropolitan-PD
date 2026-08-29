import { MessageFlags } from 'discord.js';
import { getLeoGuildConfig, patchLeoGuildConfig } from '../../../services/leo/leoState.js';
import { getSlashLeoAccessLevel } from '../../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../../services/leo/commandUtils.js';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

export default {
  name: 'leo_coc_modal',
  async execute(interaction, client, args) {
    const [action, requesterId] = args;
    if (interaction.user.id !== requesterId) {
      await interaction.reply({ content: 'Only the person who opened this editor can submit it.', flags: MessageFlags.Ephemeral });
      return;
    }
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const access = await getSlashLeoAccessLevel(interaction, client, leo);
    if (!levelAtLeast(access, 'admin')) {
      await interaction.reply({ content: 'You no longer have permission to edit the Chain of Command.', flags: MessageFlags.Ephemeral });
      return;
    }

    const coc = { ...(leo.coc || {}), teams: Array.isArray(leo.coc?.teams) ? [...leo.coc.teams] : [] };
    const teamName = interaction.fields.getTextInputValue('team_name').trim();
    const index = coc.teams.findIndex((team) => normalizeName(team.name) === normalizeName(teamName));

    if (action === 'add_team') {
      if (index !== -1) {
        await interaction.reply({ content: 'A team with that name already exists.', flags: MessageFlags.Ephemeral });
        return;
      }
      coc.teams.push({ name: teamName.slice(0, 100), ranks: [] });
    } else if (action === 'add_rank') {
      const roleId = interaction.fields.getTextInputValue('role_id').trim();
      if (!/^\d{15,22}$/.test(roleId) || !interaction.guild.roles.cache.has(roleId)) {
        await interaction.reply({ content: 'Provide a valid role ID from this server.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (index === -1) {
        await interaction.reply({ content: 'That team does not exist. Add the team first.', flags: MessageFlags.Ephemeral });
        return;
      }
      const rawLimit = interaction.fields.getTextInputValue('rank_limit')?.trim();
      const limit = rawLimit ? Number.parseInt(rawLimit, 10) : null;
      if (rawLimit && (!Number.isInteger(limit) || limit < 1 || limit > 1000)) {
        await interaction.reply({ content: 'Rank limit must be a whole number from 1 to 1000.', flags: MessageFlags.Ephemeral });
        return;
      }
      const ranks = [...(coc.teams[index].ranks || [])];
      const existingRank = ranks.findIndex((rank) => rank.roleId === roleId);
      if (existingRank !== -1) ranks[existingRank] = { roleId, limit };
      else ranks.push({ roleId, limit });
      coc.teams[index] = { ...coc.teams[index], ranks };

      const rankLimits = { ...(leo.rankLimits || {}) };
      if (limit) rankLimits[roleId] = limit;
      else delete rankLimits[roleId];
      await patchLeoGuildConfig(client, interaction.guildId, { coc, rankLimits });
      await interaction.reply({ content: `Added/updated <@&${roleId}> in **${coc.teams[index].name}**${limit ? ` with limit ${limit}` : ''}.`, flags: MessageFlags.Ephemeral });
      return;
    } else if (action === 'remove_team') {
      if (index === -1) {
        await interaction.reply({ content: 'That team does not exist.', flags: MessageFlags.Ephemeral });
        return;
      }
      coc.teams.splice(index, 1);
    } else if (action === 'remove_rank') {
      const roleId = interaction.fields.getTextInputValue('role_id').trim();
      if (index === -1) {
        await interaction.reply({ content: 'That team does not exist.', flags: MessageFlags.Ephemeral });
        return;
      }
      const ranks = (coc.teams[index].ranks || []).filter((rank) => rank.roleId !== roleId);
      coc.teams[index] = { ...coc.teams[index], ranks };
      const rankLimits = { ...(leo.rankLimits || {}) };
      delete rankLimits[roleId];
      await patchLeoGuildConfig(client, interaction.guildId, { coc, rankLimits });
      await interaction.reply({ content: `Removed <@&${roleId}> from **${coc.teams[index].name}**.`, flags: MessageFlags.Ephemeral });
      return;
    }

    await patchLeoGuildConfig(client, interaction.guildId, { coc });
    await interaction.reply({ content: 'Chain of Command updated. Run `/coc` again to view or continue editing.', flags: MessageFlags.Ephemeral });
  },
};
