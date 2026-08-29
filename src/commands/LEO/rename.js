import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getTicketData } from '../../utils/database.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel } from '../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../services/leo/commandUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription("Rename the ticket you're in")
    .setDMPermission(false)
    .addStringOption((o) => o.setName('name').setDescription('New channel name').setRequired(true).setMinLength(1).setMaxLength(90)),
  async execute(interaction, config, client) {
    const ticket = await getTicketData(interaction.guildId, interaction.channelId);
    if (!ticket || ticket.status !== 'open') return interaction.reply({ content: 'This is not an open ticket.', flags: MessageFlags.Ephemeral });
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const category = ticket.categoryKey ? leo.ticketCategories?.[ticket.categoryKey] : null;
    const supportRoleId = category?.supportRoleId || ticket.supportRoleId || config?.ticketStaffRoleId;
    const level = await getSlashLeoAccessLevel(interaction, client, leo);
    const allowed = levelAtLeast(level, 'admin') || ticket.claimedBy === interaction.user.id || (supportRoleId && interaction.member.roles.cache.has(supportRoleId));
    if (!allowed) return interaction.reply({ content: 'Only ticket staff can rename this ticket.', flags: MessageFlags.Ephemeral });
    const raw = interaction.options.getString('name', true);
    const name = raw.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'ticket';
    await interaction.channel.setName(name, `Ticket renamed by ${interaction.user.tag}`);
    await interaction.reply({ content: `Ticket renamed to **#${name}**.` });
  },
};
