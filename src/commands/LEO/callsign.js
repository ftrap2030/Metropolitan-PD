import { SlashCommandBuilder } from 'discord.js';
import { getCallsigns } from '../../services/leo/departmentManagementService.js';
import { replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('callsign')
    .setDescription('Show a member’s assigned callsign')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member to check').setRequired(false)),
  async execute(interaction, config, client) {
    const target = interaction.options.getUser('user') || interaction.user;
    const callsigns = await getCallsigns(client, interaction.guildId);
    const callsign = callsigns[target.id] || null;
    await replyInfo(
      interaction,
      `Callsign — ${target.username}`,
      callsign ? `${target} is assigned **${callsign}**.` : `${target} does not have a callsign assigned.`,
      false,
    );
  },
};
