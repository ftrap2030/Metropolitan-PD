import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel, replySuccess } from '../../services/leo/slashUtils.js';
import { levelAtLeast, canAddRoleWithinLimit } from '../../services/leo/commandUtils.js';
import { createHrCase } from '../../services/leo/hrService.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Announce a promotion, give the rank role, DM the target, and log the case')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member being promoted').setRequired(true))
    .addRoleOption((o) => o.setName('new_rank_role').setDescription('New rank role').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Promotion reason').setMaxLength(500))
    .addStringOption((o) => o.setName('notes').setDescription('Internal staff note').setMaxLength(1000)),
  async execute(interaction, config, client) {
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    if (leo.hrSystemEnabled === false) return interaction.reply({ content: 'The HR system is disabled in this server.', ephemeral: true });
    const level = await getSlashLeoAccessLevel(interaction, client, leo);
    const roleAccess = leo.promotionRoleId && interaction.member.roles.cache.has(leo.promotionRoleId);
    if (!levelAtLeast(level, 'admin') && !roleAccess) return interaction.reply({ content: 'You do not have access to /promote.', ephemeral: true });

    const target = interaction.options.getMember('user');
    const role = interaction.options.getRole('new_rank_role', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const notes = interaction.options.getString('notes');
    if (!target) return interaction.reply({ content: 'That member is not in this server.', ephemeral: true });
    if (!role.editable) return interaction.reply({ content: 'The bot cannot manage the selected rank role.', ephemeral: true });
    if (interaction.guild.ownerId !== interaction.user.id && target.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ content: 'You cannot promote a member at or above your hierarchy.', ephemeral: true });
    }
    if (!canAddRoleWithinLimit(interaction.guild, leo, role.id, target.id)) {
      return interaction.reply({ content: 'That rank has reached its configured member limit.', ephemeral: true });
    }

    const team = (leo.coc?.teams || []).find((entry) => (entry.ranks || []).some((rank) => rank.roleId === role.id));
    if (team) {
      const oldRankIds = (team.ranks || []).map((rank) => rank.roleId).filter((id) => id !== role.id && target.roles.cache.has(id));
      const removable = oldRankIds.filter((id) => interaction.guild.roles.cache.get(id)?.editable);
      if (removable.length) await target.roles.remove(removable, `Promotion by ${interaction.user.tag}`);
    }
    if (!target.roles.cache.has(role.id)) await target.roles.add(role, `Promotion by ${interaction.user.tag}`);

    const record = await createHrCase(client, interaction.guildId, {
      kind: 'promotion', targetId: target.id, staffId: interaction.user.id,
      newRankRoleId: role.id, reason,
      notes: notes ? [{ text: notes, authorId: interaction.user.id, createdAt: new Date().toISOString() }] : [],
    });

    const publicEmbed = createEmbed({
      title: 'Staff Promotion',
      description: `${target} has been promoted to ${role}.\n\n**Reason:** ${reason}\n**Case:** #${record.id}`,
      color: 'success',
      image: leo.banners?.promotion || null,
    });
    const channel = leo.promotionChannelId
      ? interaction.guild.channels.cache.get(leo.promotionChannelId) || await interaction.guild.channels.fetch(leo.promotionChannelId).catch(() => null)
      : interaction.channel;
    if (channel?.isTextBased?.()) await channel.send({ embeds: [publicEmbed] });
    await target.send({ embeds: [publicEmbed] }).catch(() => {});
    await replySuccess(interaction, 'Promotion Logged', `${target} was promoted to ${role}. Case #${record.id} was created.`);
  },
};
