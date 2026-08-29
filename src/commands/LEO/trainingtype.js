import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { addTrainingType, getTrainingTypes, removeTrainingType } from '../../services/leo/staffOperationsService.js';
import { replyInfo, replySuccess, requireSlashLevel } from '../../services/leo/slashUtils.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('trainingtype')
    .setDescription('Manage configured training programs')
    .setDMPermission(false)
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Add a training program')
      .addStringOption((o) => o.setName('name').setDescription('Training program name').setRequired(true).setMaxLength(100)))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Remove a training program')
      .addStringOption((o) => o.setName('name').setDescription('Training program name').setRequired(true).setMaxLength(100)))
    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('List configured training programs')),
  async execute(interaction, config, client) {
    if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'list') {
      const types = await getTrainingTypes(client, interaction.guildId);
      await replyInfo(interaction, `Training Programs (${types.length})`, types.length ? types.map((name, index) => `${index + 1}. **${name}**`).join('\n') : 'No training programs are configured. Until one is added, trainers may use any program name.', true);
      return;
    }

    const name = interaction.options.getString('name', true);
    const result = subcommand === 'add'
      ? await addTrainingType(client, interaction.guildId, name)
      : await removeTrainingType(client, interaction.guildId, name);
    if (!result.ok) {
      const message = result.reason === 'duplicate'
        ? `**${result.name}** is already configured.`
        : result.reason === 'not_found'
          ? 'That training program is not configured.'
          : 'Provide a valid training program name.';
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      return;
    }
    await replySuccess(interaction, subcommand === 'add' ? 'Training Program Added' : 'Training Program Removed', `**${result.name}** was ${subcommand === 'add' ? 'added to' : 'removed from'} the configured training programs.`, true);
  },
};
