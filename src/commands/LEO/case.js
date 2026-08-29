import { SlashCommandBuilder } from 'discord.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { getUserHrCases } from '../../services/leo/hrService.js';
import { getLeoGuildConfig, isProtectedUser } from '../../services/leo/leoState.js';
import { requireSlashLevel, replyInfo } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Show a quick moderation and HR snapshot for a user')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User to inspect').setRequired(true)),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const user = interaction.options.getUser('user', true);
    const member = interaction.options.getMember('user');
    const [warnings, hrCases, leo] = await Promise.all([
      WarningService.getWarnings(interaction.guildId, user.id).catch(() => []),
      getUserHrCases(client, interaction.guildId, user.id),
      getLeoGuildConfig(client, interaction.guildId),
    ]);
    const activeHr = hrCases.filter((record) => record.status !== 'revoked');
    const latest = hrCases.slice(0, 5).map((record) => `#${record.id} ${record.kind === 'promotion' ? 'Promotion' : record.type} — ${record.status}`).join('\n') || 'None';
    await replyInfo(interaction, `Case Snapshot: ${user.tag}`, `Moderation snapshot for ${user}.`, true, [
      { name: 'Warnings', value: String(warnings.length), inline: true },
      { name: 'HR Cases', value: `${hrCases.length} total / ${activeHr.length} active`, inline: true },
      { name: 'Protected', value: isProtectedUser(leo, user.id) ? 'Yes' : 'No', inline: true },
      { name: 'In Server', value: member ? 'Yes' : 'No', inline: true },
      { name: 'Recent HR Cases', value: latest, inline: false },
    ]);
  },
};
