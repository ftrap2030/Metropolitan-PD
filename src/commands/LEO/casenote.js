import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel, replySuccess } from '../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../services/leo/commandUtils.js';
import { addHrCaseNote } from '../../services/leo/hrService.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('casenote')
    .setDescription('Add an internal staff note to an HR case')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('case').setDescription('Case number').setRequired(true))
    .addStringOption((o) => o.setName('note').setDescription('Internal staff note').setRequired(true).setMaxLength(1500)),
  async execute(interaction, config, client) {
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const level = await getSlashLeoAccessLevel(interaction, client, leo);
    const hrRole = (leo.infractionRoleId && interaction.member.roles.cache.has(leo.infractionRoleId)) || (leo.promotionRoleId && interaction.member.roles.cache.has(leo.promotionRoleId));
    if (!levelAtLeast(level, 'admin') && !hrRole) return interaction.reply({ content: 'You do not have access to HR case notes.', ephemeral: true });
    const caseId = interaction.options.getString('case', true).replace(/^#/, '').padStart(4, '0');
    const updated = await addHrCaseNote(client, interaction.guildId, caseId, { text: interaction.options.getString('note', true), authorId: interaction.user.id });
    if (!updated) return interaction.reply({ content: 'That HR case was not found.', ephemeral: true });
    await replySuccess(interaction, 'Case Note Added', `Added an internal note to case #${caseId}.`);
  },
};
