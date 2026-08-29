import { SlashCommandBuilder } from 'discord.js';
import { getCallsigns } from '../../services/leo/departmentManagementService.js';
import { replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('callsigns')
    .setDescription('List assigned callsigns in this server')
    .setDMPermission(false),
  async execute(interaction, config, client) {
    const callsigns = await getCallsigns(client, interaction.guildId);
    const entries = Object.entries(callsigns)
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      .slice(0, 40);
    const description = entries.length
      ? entries.map(([userId, callsign]) => `**${callsign}** — <@${userId}>`).join('\n')
      : 'No callsigns have been assigned yet. A Role Manager or Admin can use `!callsign @user 1A-12`.';
    await replyInfo(interaction, `Callsign Roster (${entries.length})`, description, false);
  },
};
