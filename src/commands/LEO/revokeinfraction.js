import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel, replySuccess } from '../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../services/leo/commandUtils.js';
import { getHrCase, updateHrCase } from '../../services/leo/hrService.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('revokeinfraction')
    .setDescription('Revoke an HR infraction directly')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('case').setDescription('Case number').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for revocation').setMaxLength(1000)),
  async execute(interaction, config, client) {
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const level = await getSlashLeoAccessLevel(interaction, client, leo);
    const roleAccess = leo.infractionRoleId && interaction.member.roles.cache.has(leo.infractionRoleId);
    if (!levelAtLeast(level, 'admin') && !roleAccess) return interaction.reply({ content: 'You do not have access to revoke HR infractions.', ephemeral: true });

    const caseId = interaction.options.getString('case', true).replace(/^#/, '').padStart(4, '0');
    const record = await getHrCase(client, interaction.guildId, caseId);
    if (!record || record.kind !== 'infraction') return interaction.reply({ content: 'That infraction case was not found.', ephemeral: true });
    if (record.status === 'revoked') return interaction.reply({ content: 'That infraction is already revoked.', ephemeral: true });

    const target = await interaction.guild.members.fetch(record.targetId).catch(() => null);
    if (target && record.appliedRoleId) {
      const role = interaction.guild.roles.cache.get(record.appliedRoleId);
      if (role?.editable && target.roles.cache.has(role.id)) await target.roles.remove(role, `Infraction case #${caseId} revoked`);
    }
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await updateHrCase(client, interaction.guildId, caseId, {
      status: 'revoked', revokedBy: interaction.user.id, revokedAt: new Date().toISOString(), revokeReason: reason,
    });
    await replySuccess(interaction, 'Infraction Revoked', `Case #${caseId} was revoked.\nReason: ${reason}`);
  },
};
