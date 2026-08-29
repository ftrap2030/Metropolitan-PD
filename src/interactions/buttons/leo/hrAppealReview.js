import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../../../config/bot.js';
import { getHrCase, updateHrCase } from '../../../services/leo/hrService.js';
import { getLeoGuildConfig, isLeoBypassed } from '../../../services/leo/leoState.js';

async function canReview(interaction, client, leo) {
  if (isBotOwner(interaction.user.id) || await isLeoBypassed(client, interaction.user.id)) return true;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  if (interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return Boolean(leo.infractionAppealRoleId && interaction.member?.roles?.cache?.has(leo.infractionAppealRoleId));
}

export default {
  name: 'leo_hr_appeal_review',
  async execute(interaction, client, args) {
    const [guildId, caseId, decisionRaw] = args;
    const decision = String(decisionRaw || '').toLowerCase();
    if (!['approve', 'deny'].includes(decision) || interaction.guildId !== guildId) {
      await interaction.reply({ content: 'This appeal review action is invalid.', flags: MessageFlags.Ephemeral });
      return;
    }

    const leo = await getLeoGuildConfig(client, guildId);
    if (!(await canReview(interaction, client, leo))) {
      await interaction.reply({ content: 'You do not have permission to review HR appeals.', flags: MessageFlags.Ephemeral });
      return;
    }

    const record = await getHrCase(client, guildId, caseId);
    if (!record || record.kind !== 'infraction') {
      await interaction.reply({ content: 'This HR case no longer exists.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (record.appeal?.status !== 'pending') {
      await interaction.reply({ content: `This appeal is already ${record.appeal?.status || 'closed'}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const reviewedAt = new Date().toISOString();
    const appeal = {
      ...record.appeal,
      status: decision === 'approve' ? 'approved' : 'denied',
      reviewedBy: interaction.user.id,
      reviewedAt,
    };

    if (decision === 'approve') {
      const target = await interaction.guild.members.fetch(record.targetId).catch(() => null);
      if (target && record.appliedRoleId) {
        const role = interaction.guild.roles.cache.get(record.appliedRoleId)
          || await interaction.guild.roles.fetch(record.appliedRoleId).catch(() => null);
        if (role?.editable && target.roles.cache.has(role.id)) {
          await target.roles.remove(role, `HR appeal approved for case #${caseId}`).catch(() => {});
        }
      }
      await updateHrCase(client, guildId, caseId, {
        status: 'revoked',
        revokedBy: interaction.user.id,
        revokedAt: reviewedAt,
        revokeReason: 'HR appeal approved',
        appeal,
      });
    } else {
      await updateHrCase(client, guildId, caseId, { appeal });
    }

    const targetUser = await client.users.fetch(record.targetId).catch(() => null);
    if (targetUser) {
      await targetUser.send(
        `Your HR appeal for case #${caseId} in **${interaction.guild.name}** was **${decision === 'approve' ? 'approved' : 'denied'}**.`
      ).catch(() => {});
    }

    const original = interaction.message.embeds?.[0];
    const embed = original
      ? EmbedBuilder.from(original).addFields({
          name: 'Review Decision',
          value: `**${decision === 'approve' ? 'Approved' : 'Denied'}** by ${interaction.user}`,
          inline: false,
        })
      : new EmbedBuilder().setTitle(`HR Appeal — Case #${caseId}`).setDescription(`**${decision}** by ${interaction.user}`);

    await interaction.update({ embeds: [embed], components: [] });
  },
};
