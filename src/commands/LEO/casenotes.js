import { SlashCommandBuilder } from 'discord.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel, replyInfo } from '../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../services/leo/commandUtils.js';
import { getHrCase } from '../../services/leo/hrService.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('casenotes')
    .setDescription("View an HR case's internal staff notes")
    .setDMPermission(false)
    .addStringOption((o) => o.setName('case').setDescription('Case number').setRequired(true)),
  async execute(interaction, config, client) {
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const level = await getSlashLeoAccessLevel(interaction, client, leo);
    const hrRole = (leo.infractionRoleId && interaction.member.roles.cache.has(leo.infractionRoleId)) || (leo.promotionRoleId && interaction.member.roles.cache.has(leo.promotionRoleId));
    if (!levelAtLeast(level, 'admin') && !hrRole) return interaction.reply({ content: 'You do not have access to HR case notes.', ephemeral: true });
    const caseId = interaction.options.getString('case', true).replace(/^#/, '').padStart(4, '0');
    const record = await getHrCase(client, interaction.guildId, caseId);
    if (!record) return interaction.reply({ content: 'That HR case was not found.', ephemeral: true });
    const notes = record.notes || [];
    const description = notes.length
      ? notes.map((note, index) => `**${index + 1}.** <@${note.authorId}> — ${note.text}`).join('\n')
      : 'This case has no internal notes.';
    await replyInfo(interaction, `Case #${caseId} Notes`, description);
  },
};
