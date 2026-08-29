import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../../../config/bot.js';
import { getLeoGuildConfig, isLeoBypassed } from '../../../services/leo/leoState.js';
import { manageableRoles } from '../../../services/leo/commandUtils.js';

export default {
  name: 'leo_role',
  async execute(interaction, client, args) {
    const [targetId, requesterId] = args;
    if (interaction.user.id !== requesterId) {
      await interaction.reply({ content: 'Only the staff member who opened this role picker can use it.', flags: MessageFlags.Ephemeral });
      return;
    }

    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const member = interaction.member;
    const allowed =
      isBotOwner(interaction.user.id) ||
      await isLeoBypassed(client, interaction.user.id) ||
      interaction.guild.ownerId === interaction.user.id ||
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      (leo.adminRoleId && member.roles.cache.has(leo.adminRoleId)) ||
      (leo.roleManagerRoleId && member.roles.cache.has(leo.roleManagerRoleId));

    if (!allowed) {
      await interaction.reply({ content: 'You no longer have permission to manage roles.', flags: MessageFlags.Ephemeral });
      return;
    }

    const target = interaction.guild.members.cache.get(targetId) || await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!target) {
      await interaction.reply({ content: 'The target member is no longer in this server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const displayed = manageableRoles(interaction.guild).slice(0, 25);
    const displayedIds = new Set(displayed.map((role) => role.id));
    const selectedIds = new Set(interaction.values.filter((id) => displayedIds.has(id)));
    const add = displayed.filter((role) => selectedIds.has(role.id) && !target.roles.cache.has(role.id)).map((role) => role.id);
    const remove = displayed.filter((role) => !selectedIds.has(role.id) && target.roles.cache.has(role.id)).map((role) => role.id);

    if (add.length) await target.roles.add(add, `Role checklist used by ${interaction.user.tag}`);
    if (remove.length) await target.roles.remove(remove, `Role checklist used by ${interaction.user.tag}`);

    await interaction.update({
      content: `Updated roles for ${target}. Added ${add.length}, removed ${remove.length}.`,
      components: [],
    });
  },
};
