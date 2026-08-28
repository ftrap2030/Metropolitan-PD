import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { requireSlashLevel, replySuccess } from '../../services/leo/slashUtils.js';
import { manageableRoles, canAddRoleWithinLimit } from '../../services/leo/commandUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('morph')
    .setDescription('Temporarily appear to hold only one role; .unmorph restores your roles')
    .setDMPermission(false)
    .addRoleOption((o) => o.setName('role').setDescription('Role to keep while morphed').setRequired(true)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const role = interaction.options.getRole('role', true);
    if (!role.editable) return interaction.reply({ content: 'The bot cannot manage that role.', ephemeral: true });
    if (interaction.guild.ownerId !== interaction.user.id && interaction.member.roles.highest.position <= role.position) {
      return interaction.reply({ content: 'That role is at or above your highest role.', ephemeral: true });
    }
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    if (!canAddRoleWithinLimit(interaction.guild, leo, role.id, interaction.user.id)) {
      return interaction.reply({ content: 'That role has reached its configured rank limit.', ephemeral: true });
    }
    const roles = manageableRoles(interaction.guild).filter((r) => interaction.member.roles.cache.has(r.id));
    await client.db.set(`leo:morph:${interaction.guildId}:${interaction.user.id}`, {
      roleIds: roles.map((r) => r.id),
      morphedTo: role.id,
      at: Date.now(),
    });
    const remove = roles.filter((r) => r.id !== role.id).map((r) => r.id);
    if (remove.length) await interaction.member.roles.remove(remove, `Morph used by ${interaction.user.tag}`);
    if (!interaction.member.roles.cache.has(role.id)) await interaction.member.roles.add(role, `Morph used by ${interaction.user.tag}`);
    await replySuccess(interaction, 'Morph Applied', `You now appear with ${role}. Use \`.unmorph\` to restore your saved roles.`);
  },
};
