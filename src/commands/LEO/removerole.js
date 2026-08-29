import { SlashCommandBuilder } from 'discord.js';
import { requireSlashLevel, replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('removerole')
    .setDescription('Remove a role from a user')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Target member').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Role to remove').setRequired(true)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'rolemanager'))) return;
    const target = interaction.options.getMember('user');
    const role = interaction.options.getRole('role', true);
    if (!target) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    if (!role.editable) return interaction.reply({ content: 'The bot cannot manage that role.', ephemeral: true });
    if (interaction.guild.ownerId !== interaction.user.id && interaction.member.roles.highest.position <= role.position) {
      return interaction.reply({ content: 'That role is at or above your highest role.', ephemeral: true });
    }
    await target.roles.remove(role, `Removed by ${interaction.user.tag}`);
    await replySuccess(interaction, 'Role Removed', `${role} was removed from ${target}.`);
  },
};
