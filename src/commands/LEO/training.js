import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { addTrainingResult, getTrainingHistory } from '../../services/leo/trainingService.js';
import { replyInfo, replySuccess } from '../../services/leo/slashUtils.js';
import { resolveTrainingType } from '../../services/leo/staffOperationsService.js';
import {
  canTrainInteraction,
  postTrainingLog,
  requireTrainerAccess,
  requireTrainingChannel,
} from '../../services/leo/staffOperationsAccess.js';

function resultLabel(result) {
  return result === 'passed' ? 'PASSED' : result === 'failed' ? 'FAILED' : 'IN PROGRESS';
}

function formatRecord(record) {
  const when = Math.floor(Number(record.completedAt || record.createdAt) / 1000);
  const title = record.kind === 'ridealong' ? 'Ride Along' : record.program;
  const notes = record.completionNotes || record.notes;
  return [
    `**#${record.id} — ${title} — ${resultLabel(record.result)}**`,
    `Trainer: <@${record.trainerId}> • <t:${when}:d>`,
    notes ? `Notes: ${notes}` : null,
  ].filter(Boolean).join('\n');
}

async function recordResult(interaction, client, result) {
  if (!(await requireTrainerAccess(interaction, client))) return;
  if (!(await requireTrainingChannel(interaction, client))) return;
  const user = interaction.options.getUser('user', true);
  const requestedProgram = interaction.options.getString('program', true).trim();
  const resolved = await resolveTrainingType(client, interaction.guildId, requestedProgram);
  if (!resolved.ok) {
    await interaction.reply({
      content: `That training program is not configured. Available programs: ${resolved.types.map((name) => `**${name}**`).join(', ')}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const program = resolved.name || requestedProgram;
  const notes = result === 'failed'
    ? interaction.options.getString('reason', true).trim()
    : interaction.options.getString('notes', false)?.trim() || null;

  const record = await addTrainingResult(client, interaction.guildId, {
    traineeId: user.id,
    trainerId: interaction.user.id,
    program,
    result,
    notes,
  });

  await user.send(
    `A training record was added for you in **${interaction.guild.name}**.\n` +
    `Program: **${record.program}**\nResult: **${resultLabel(record.result)}**` +
    `${notes ? `\nNotes: ${notes}` : ''}`
  ).catch(() => {});

  await postTrainingLog(
    interaction,
    client,
    `Training ${resultLabel(result)}`,
    `Trainee: <@${user.id}>\nTrainer: <@${interaction.user.id}>\nProgram: **${record.program}**\nRecord: **#${record.id}**${notes ? `\nNotes: ${notes}` : ''}`,
  );

  await replySuccess(
    interaction,
    `Training ${result === 'passed' ? 'Passed' : 'Failed'}`,
    `Recorded **${record.program}** for ${user} as **${resultLabel(result)}**.\nRecord: **#${record.id}**${notes ? `\nNotes: ${notes}` : ''}`,
    true,
  );
}

async function history(interaction, client) {
  const target = interaction.options.getUser('user', false) || interaction.user;
  if (target.id !== interaction.user.id && !(await canTrainInteraction(interaction, client))) {
    await interaction.reply({ content: 'You can only view your own training history.', flags: MessageFlags.Ephemeral });
    return;
  }

  const limit = interaction.options.getInteger('limit', false) || 10;
  const records = await getTrainingHistory(client, interaction.guildId, target.id, limit);
  const description = records.length
    ? records.map(formatRecord).join('\n\n')
    : `${target} has no training records yet.`;
  await replyInfo(interaction, `Training History — ${target.username}`, description, true);
}

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('training')
    .setDescription('Record and review staff training results')
    .setDMPermission(false)
    .addSubcommand((sub) => sub
      .setName('pass')
      .setDescription('Record a passed training')
      .addUserOption((o) => o.setName('user').setDescription('Trainee').setRequired(true))
      .addStringOption((o) => o.setName('program').setDescription('Configured training program').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('notes').setDescription('Optional trainer notes').setRequired(false).setMaxLength(1000)))
    .addSubcommand((sub) => sub
      .setName('fail')
      .setDescription('Record a failed training')
      .addUserOption((o) => o.setName('user').setDescription('Trainee').setRequired(true))
      .addStringOption((o) => o.setName('program').setDescription('Configured training program').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('reason').setDescription('Reason the training was failed').setRequired(true).setMaxLength(1000)))
    .addSubcommand((sub) => sub
      .setName('history')
      .setDescription('View training history')
      .addUserOption((o) => o.setName('user').setDescription('User to view; defaults to you').setRequired(false))
      .addIntegerOption((o) => o.setName('limit').setDescription('Records to show').setRequired(false).setMinValue(1).setMaxValue(25))),
  async execute(interaction, config, client) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'pass') return recordResult(interaction, client, 'passed');
    if (subcommand === 'fail') return recordResult(interaction, client, 'failed');
    if (subcommand === 'history') return history(interaction, client);
  },
};
