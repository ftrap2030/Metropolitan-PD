import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig, patchLeoGuildConfig } from '../../services/leo/leoState.js';
import { requireBotOwner, replySuccess } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Add or remove a user from the bot Admin tier')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User to change').setRequired(true))
    .addStringOption((o) => o.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
      { name: 'Add', value: 'add' },
      { name: 'Remove', value: 'remove' },
    )),
  async execute(interaction, config, client) {
    if (!(await requireBotOwner(interaction, client))) return;
    const target = interaction.options.getUser('user');
    const action = interaction.options.getString('action');
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const admins = new Set((leo.adminUsers || []).map(String));
    if (action === 'add') admins.add(target.id);
    else admins.delete(target.id);
    await patchLeoGuildConfig(client, interaction.guildId, { adminUsers: [...admins] });
    await replySuccess(interaction, 'Admin Tier Updated', `${target} was **${action === 'add' ? 'added to' : 'removed from'}** the bot Admin tier.`);
  },
};
