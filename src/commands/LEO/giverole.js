import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { requireSlashLevel, replySuccess } from '../../services/leo/slashUtils.js';
import { canAddRoleWithinLimit } from '../../services/leo/commandUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Give a role to a user')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Target member').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Role to give').setRequired(true)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'rolemanager'))) return;
    const target = interaction.options.getMember('user');
    const role = interaction.options.getRole('role', true);
    if (!target) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    if (!role.editable) return interaction.reply({ content: 'The bot cannot manage that role.', ephemeral: true });
    if (interaction.guild.ownerId !== interaction.user.id && interaction.member.roles.highest.position <= role.position) {
      return interaction.reply({ content: 'That role is at or above your highest role.', ephemeral: true });
    }
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    if (!canAddRoleWithinLimit(interaction.guild, leo, role.id, target.id)) {
      return interaction.reply({ content: 'That role has reached its configured rank limit.', ephemeral: true });
    }
    await target.roles.add(role, `Given by ${interaction.user.tag}`);
    await replySuccess(interaction, 'Role Given', `${role} was given to ${target}.`);
  },
};
