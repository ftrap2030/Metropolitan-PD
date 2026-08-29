import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getTicketData, saveTicketData } from '../../utils/database.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel } from '../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../services/leo/commandUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('switchpanel')
    .setDescription('Switch this ticket to a different configured category')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('category').setDescription('Ticket category').setRequired(true).setAutocomplete(true)),
  async autocomplete(interaction, client) {
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = Object.entries(leo.ticketCategories || {})
      .filter(([key, category]) => key.includes(focused) || String(category.name).toLowerCase().includes(focused))
      .slice(0, 25)
      .map(([key, category]) => ({ name: category.name, value: key }));
    await interaction.respond(choices);
  },
  async execute(interaction, config, client) {
    const ticket = await getTicketData(interaction.guildId, interaction.channelId);
    if (!ticket || ticket.status !== 'open') return interaction.reply({ content: 'This command can only be used in an open ticket.', flags: MessageFlags.Ephemeral });
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const access = await getSlashLeoAccessLevel(interaction, client, leo);
    const currentCategory = ticket.categoryKey ? leo.ticketCategories?.[ticket.categoryKey] : null;
    const support = currentCategory?.supportRoleId || ticket.supportRoleId;
    if (!levelAtLeast(access, 'admin') && !(support && interaction.member.roles.cache.has(support))) {
      return interaction.reply({ content: 'Only the ticket support team can switch this ticket category.', flags: MessageFlags.Ephemeral });
    }
    const key = interaction.options.getString('category', true);
    const next = leo.ticketCategories?.[key];
    if (!next) return interaction.reply({ content: 'That ticket category no longer exists.', flags: MessageFlags.Ephemeral });

    if (ticket.supportRoleId && ticket.supportRoleId !== next.supportRoleId) {
      await interaction.channel.permissionOverwrites.edit(ticket.supportRoleId, { ViewChannel: false }).catch(() => {});
    }
    if (next.supportRoleId) {
      await interaction.channel.permissionOverwrites.edit(next.supportRoleId, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
      }).catch(() => {});
    }
    await saveTicketData(interaction.guildId, interaction.channelId, {
      ...ticket, categoryKey: key, categoryName: next.name, supportRoleId: next.supportRoleId || null,
    });
    await interaction.reply({ content: `Ticket category changed to **${next.name}**.` });
  },
};
