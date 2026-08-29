import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getTicketData } from '../../utils/database.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('closerequest')
    .setDescription("Ask staff to close the ticket you're in")
    .setDMPermission(false)
    .addStringOption((o) => o.setName('reason').setDescription('Why this ticket can be closed').setRequired(true).setMaxLength(500)),
  async execute(interaction, config, client) {
    const ticket = await getTicketData(interaction.guildId, interaction.channelId);
    if (!ticket || ticket.status !== 'open') {
      await interaction.reply({ content: 'This command can only be used inside an open ticket.', flags: MessageFlags.Ephemeral });
      return;
    }
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const category = ticket.categoryKey ? leo.ticketCategories?.[ticket.categoryKey] : null;
    const supportRoleId = category?.supportRoleId || ticket.supportRoleId || config?.ticketStaffRoleId || null;
    const reason = interaction.options.getString('reason', true);
    await interaction.reply({
      content: supportRoleId ? `<@&${supportRoleId}>` : undefined,
      embeds: [createEmbed({
        title: 'Close Request',
        description: `${interaction.user} requested that this ticket be closed.\n\n**Reason:** ${reason}`,
        color: 'warning',
      })],
      allowedMentions: supportRoleId ? { roles: [supportRoleId] } : { parse: [] },
    });
  },
};
