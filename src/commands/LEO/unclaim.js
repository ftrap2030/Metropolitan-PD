import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getTicketData, saveTicketData } from '../../utils/database.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel } from '../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../services/leo/commandUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('unclaim')
    .setDescription("Unclaim the ticket you're in")
    .setDMPermission(false),
  async execute(interaction, config, client) {
    const ticket = await getTicketData(interaction.guildId, interaction.channelId);
    if (!ticket || ticket.status !== 'open') return interaction.reply({ content: 'This is not an open ticket.', flags: MessageFlags.Ephemeral });
    if (!ticket.claimedBy) return interaction.reply({ content: 'This ticket is not currently claimed.', flags: MessageFlags.Ephemeral });
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const level = await getSlashLeoAccessLevel(interaction, client, leo);
    if (ticket.claimedBy !== interaction.user.id && !levelAtLeast(level, 'admin')) {
      return interaction.reply({ content: 'Only the staff member who claimed the ticket or an Admin can unclaim it.', flags: MessageFlags.Ephemeral });
    }
    await saveTicketData(interaction.guildId, interaction.channelId, { ...ticket, claimedBy: null, claimedAt: null });
    await interaction.reply({ content: `${interaction.user} unclaimed this ticket.` });
  },
};
