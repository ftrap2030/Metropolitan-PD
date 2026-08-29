import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  completeRidealong,
  getActiveRidealongForUser,
  startRidealong,
} from '../../services/leo/trainingService.js';
import { replyInfo, replySuccess } from '../../services/leo/slashUtils.js';
import { postTrainingLog, requireTrainerAccess, requireTrainingChannel } from '../../services/leo/staffOperationsAccess.js';

function label(result) {
  return result === 'passed' ? 'PASSED' : result === 'failed' ? 'FAILED' : 'IN PROGRESS';
}

async function start(interaction, client) {
  if (!(await requireTrainerAccess(interaction, client))) return;
  if (!(await requireTrainingChannel(interaction, client))) return;
  const user = interaction.options.getUser('user', true);
  const notes = interaction.options.getString('notes', false)?.trim() || null;
  const result = await startRidealong(client, interaction.guildId, user.id, interaction.user.id, notes);
  if (!result.ok) {
    const existing = result.record;
    await interaction.reply({
      content: existing
        ? `${user} already has active ride-along **#${existing.id}**.`
        : `${user} already has an active ride-along.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await user.send(
    `A ride-along has been started for you in **${interaction.guild.name}** by **${interaction.user.username}**.` +
    `${notes ? `\nTrainer notes: ${notes}` : ''}`
  ).catch(() => {});

  await postTrainingLog(
    interaction,
    client,
    'Ride-Along Started',
    `Trainee: <@${user.id}>\nTrainer: <@${interaction.user.id}>\nRecord: **#${result.record.id}**${notes ? `\nNotes: ${notes}` : ''}`,
  );

  await replySuccess(
    interaction,
    'Ride-Along Started',
    `Ride-along **#${result.record.id}** started for ${user}.\nTrainer: ${interaction.user}${notes ? `\nNotes: ${notes}` : ''}`,
    true,
  );
}

async function complete(interaction, client) {
  if (!(await requireTrainerAccess(interaction, client))) return;
  if (!(await requireTrainingChannel(interaction, client))) return;
  const user = interaction.options.getUser('user', true);
  const finalResult = interaction.options.getString('result', true);
  const notes = interaction.options.getString('notes', false)?.trim() || null;
  const result = await completeRidealong(
    client,
    interaction.guildId,
    user.id,
    interaction.user.id,
    finalResult,
    notes,
  );

  if (!result.ok) {
    await interaction.reply({
      content: result.reason === 'not_active'
        ? `${user} does not have an active ride-along.`
        : 'That ride-along could not be completed.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await user.send(
    `Your ride-along **#${result.record.id}** in **${interaction.guild.name}** was completed as **${label(finalResult)}**.` +
    `${notes ? `\nTrainer notes: ${notes}` : ''}`
  ).catch(() => {});

  await postTrainingLog(
    interaction,
    client,
    `Ride-Along ${label(finalResult)}`,
    `Trainee: <@${user.id}>\nCompleted by: <@${interaction.user.id}>\nRecord: **#${result.record.id}**${notes ? `\nNotes: ${notes}` : ''}`,
  );

  await replySuccess(
    interaction,
    'Ride-Along Completed',
    `Ride-along **#${result.record.id}** for ${user} was marked **${label(finalResult)}**.${notes ? `\nNotes: ${notes}` : ''}`,
    true,
  );
}

async function status(interaction, client) {
  const user = interaction.options.getUser('user', false) || interaction.user;
  const record = await getActiveRidealongForUser(client, interaction.guildId, user.id);
  if (!record) {
    await replyInfo(interaction, 'Ride-Along Status', `${user} does not currently have an active ride-along.`, true);
    return;
  }
  const started = Math.floor(Number(record.startedAt) / 1000);
  await replyInfo(
    interaction,
    `Ride-Along #${record.id}`,
    `${user} is currently in a ride-along.\nTrainer: <@${record.trainerId}>\nStarted: <t:${started}:R>${record.notes ? `\nNotes: ${record.notes}` : ''}`,
    true,
  );
}

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('ridealong')
    .setDescription('Manage Low Rank ride-along training')
    .setDMPermission(false)
    .addSubcommand((sub) => sub
      .setName('start')
      .setDescription('Start a trainee ride-along')
      .addUserOption((o) => o.setName('user').setDescription('Trainee').setRequired(true))
      .addStringOption((o) => o.setName('notes').setDescription('Optional starting notes').setRequired(false).setMaxLength(1000)))
    .addSubcommand((sub) => sub
      .setName('complete')
      .setDescription('Complete a trainee ride-along')
      .addUserOption((o) => o.setName('user').setDescription('Trainee').setRequired(true))
      .addStringOption((o) => o.setName('result').setDescription('Final result').setRequired(true).addChoices(
        { name: 'Pass', value: 'passed' },
        { name: 'Fail', value: 'failed' },
      ))
      .addStringOption((o) => o.setName('notes').setDescription('Completion notes').setRequired(false).setMaxLength(1000)))
    .addSubcommand((sub) => sub
      .setName('status')
      .setDescription('Check an active ride-along')
      .addUserOption((o) => o.setName('user').setDescription('User to check; defaults to you').setRequired(false))),
  async execute(interaction, config, client) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'start') return start(interaction, client);
    if (subcommand === 'complete') return complete(interaction, client);
    if (subcommand === 'status') return status(interaction, client);
  },
};
