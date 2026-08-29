import { SlashCommandBuilder } from 'discord.js';
import { patchLeoGuildConfig } from '../../services/leo/leoState.js';
import { requireSlashLevel, replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('alertrole')
    .setDescription('Set up to 3 roles and 2 members to ping when a security alert fires')
    .setDMPermission(false)
    .addRoleOption((o) => o.setName('role1').setDescription('First alert role'))
    .addRoleOption((o) => o.setName('role2').setDescription('Second alert role'))
    .addRoleOption((o) => o.setName('role3').setDescription('Third alert role'))
    .addUserOption((o) => o.setName('member1').setDescription('First alert member'))
    .addUserOption((o) => o.setName('member2').setDescription('Second alert member')),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const roleIds = ['role1', 'role2', 'role3'].map((name) => interaction.options.getRole(name)?.id).filter(Boolean);
    const userIds = ['member1', 'member2'].map((name) => interaction.options.getUser(name)?.id).filter(Boolean);
    await patchLeoGuildConfig(client, interaction.guildId, { alertRoleIds: roleIds, alertUserIds: userIds });
    await replySuccess(interaction, 'Alert Recipients Updated', roleIds.length || userIds.length
      ? `Configured ${roleIds.length} role(s) and ${userIds.length} member(s) for security alerts.`
      : 'All security-alert ping recipients were cleared.');
  },
};
