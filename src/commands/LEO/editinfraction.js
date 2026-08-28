import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel, replySuccess } from '../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../services/leo/commandUtils.js';
import { getHrCase, getInfractionRoleId, updateHrCase } from '../../services/leo/hrService.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('editinfraction')
    .setDescription("Edit an existing HR infraction's type and/or reason")
    .setDMPermission(false)
    .addStringOption((o) => o.setName('case').setDescription('Case number').setRequired(true))
    .addStringOption((o) => o.setName('new_type').setDescription('New infraction type').addChoices(
      { name: 'Warning 1', value: 'W1' }, { name: 'Warning 2', value: 'W2' },
      { name: 'Strike 1', value: 'S1' }, { name: 'Strike 2', value: 'S2' },
      { name: 'Suspension', value: 'SUSPENSION' }, { name: 'Termination', value: 'TERMINATION' },
      { name: 'Retirement', value: 'RETIREMENT' }, { name: 'Activity Watch', value: 'ACTIVITY_WATCH' },
    ))
    .addStringOption((o) => o.setName('new_reason').setDescription('New reason').setMaxLength(1000)),
  async execute(interaction, config, client) {
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const level = await getSlashLeoAccessLevel(interaction, client, leo);
    const roleAccess = leo.infractionRoleId && interaction.member.roles.cache.has(leo.infractionRoleId);
    if (!levelAtLeast(level, 'admin') && !roleAccess) return interaction.reply({ content: 'You do not have access to edit HR infractions.', ephemeral: true });

    const caseId = interaction.options.getString('case', true).replace(/^#/, '').padStart(4, '0');
    const record = await getHrCase(client, interaction.guildId, caseId);
    if (!record || record.kind !== 'infraction') return interaction.reply({ content: 'That infraction case was not found.', ephemeral: true });
    const newType = interaction.options.getString('new_type');
    const newReason = interaction.options.getString('new_reason');
    if (!newType && !newReason) return interaction.reply({ content: 'Provide a new type and/or new reason.', ephemeral: true });

    const target = await interaction.guild.members.fetch(record.targetId).catch(() => null);
    let appliedRoleId = record.appliedRoleId || null;
    if (newType && newType !== record.type && target) {
      if (record.appliedRoleId) {
        const oldRole = interaction.guild.roles.cache.get(record.appliedRoleId);
        if (oldRole?.editable && target.roles.cache.has(oldRole.id)) await target.roles.remove(oldRole, `Infraction case #${caseId} edited`);
      }
      const nextRoleId = getInfractionRoleId(leo, newType);
      if (nextRoleId) {
        const nextRole = interaction.guild.roles.cache.get(nextRoleId) || await interaction.guild.roles.fetch(nextRoleId).catch(() => null);
        if (nextRole?.editable && !target.roles.cache.has(nextRole.id)) await target.roles.add(nextRole, `Infraction case #${caseId} edited`);
      }
      appliedRoleId = nextRoleId || null;
    }

    const updated = await updateHrCase(client, interaction.guildId, caseId, {
      ...(newType ? { type: newType, appliedRoleId } : {}),
      ...(newReason ? { reason: newReason } : {}),
      editedBy: interaction.user.id,
      editedAt: new Date().toISOString(),
    });
    await replySuccess(interaction, 'Infraction Updated', `Case #${updated.id} was updated.`);
  },
};
