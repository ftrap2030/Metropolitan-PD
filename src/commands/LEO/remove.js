import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getTicketData } from '../../utils/database.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel } from '../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../services/leo/commandUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription("Remove a user's access to the ticket you're in")
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User to remove').setRequired(true)),
  async execute(interaction, config, client) {
    const ticket = await getTicketData(interaction.guildId, interaction.channelId);
    if (!ticket || ticket.status !== 'open') return interaction.reply({ content: 'This is not an open ticket.', flags: MessageFlags.Ephemeral });
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const category = ticket.categoryKey ? leo.ticketCategories?.[ticket.categoryKey] : null;
    const supportRoleId = category?.supportRoleId || ticket.supportRoleId || config?.ticketStaffRoleId;
    const level = await getSlashLeoAccessLevel(interaction, client, leo);
    const allowed = levelAtLeast(level, 'admin') || (supportRoleId && interaction.member.roles.cache.has(supportRoleId)) || ticket.claimedBy === interaction.user.id;
    if (!allowed) return interaction.reply({ content: 'Only the ticket support team can remove members.', flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser('user', true);
    if (user.id === ticket.userId) return interaction.reply({ content: 'Use the close command to remove the ticket creator; they cannot be removed while the ticket is open.', flags: MessageFlags.Ephemeral });
    await interaction.channel.permissionOverwrites.delete(user.id, `Ticket access removed by ${interaction.user.tag}`).catch(async () => {
      await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
    });
    await interaction.reply({ content: `${user} no longer has access to this ticket.` });
  },
};
