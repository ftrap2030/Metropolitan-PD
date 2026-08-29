import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  createLoaRequest,
  endLoa,
  getLoaRecords,
  isValidReturnDate,
  reviewLoa,
} from '../../services/leo/departmentManagementService.js';
import { replyInfo, replySuccess, requireSlashLevel } from '../../services/leo/slashUtils.js';

function statusLabel(status) {
  return {
    pending: 'Pending',
    approved: 'Approved',
    denied: 'Denied',
    ended: 'Ended',
  }[status] || status;
}

async function requestLoa(interaction, client) {
  const reason = interaction.options.getString('reason', true).trim();
  const returnDate = interaction.options.getString('return_date', true).trim();
  if (!isValidReturnDate(returnDate)) {
    await interaction.reply({
      content: 'Return date must use `YYYY-MM-DD` and cannot be in the past.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const result = await createLoaRequest(client, interaction.guildId, interaction.user.id, reason, returnDate);
  if (!result.ok && result.reason === 'existing') {
    await interaction.reply({
      content: `You already have an active LOA request: case **#${result.record.id}** (${statusLabel(result.record.status)}). End that request before creating another.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await replySuccess(
    interaction,
    `LOA Request #${result.record.id}`,
    `Your Leave of Absence request was submitted.\n**Return date:** ${returnDate}\n**Reason:** ${reason}`,
    true,
  );
}

async function review(interaction, client, decision) {
  if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
  const caseId = interaction.options.getInteger('case', true);
  const note = interaction.options.getString('note', false);
  const result = await reviewLoa(client, interaction.guildId, caseId, interaction.user.id, decision, note);
  if (!result.ok) {
    const message = result.reason === 'not_found'
      ? `LOA case #${caseId} was not found.`
      : result.reason === 'not_pending'
        ? `LOA case #${caseId} is already **${statusLabel(result.record?.status)}**.`
        : 'That LOA request could not be reviewed.';
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    return;
  }

  const record = result.record;
  const target = await client.users.fetch(record.userId).catch(() => null);
  if (target) {
    await target.send(
      `Your LOA request #${record.id} in **${interaction.guild.name}** was **${decision}**.` +
      `${note ? `\nStaff note: ${note}` : ''}`
    ).catch(() => {});
  }

  await replySuccess(
    interaction,
    `LOA ${decision === 'approved' ? 'Approved' : 'Denied'}`,
    `Case **#${record.id}** for <@${record.userId}> was **${decision}**.${note ? `\nStaff note: ${note}` : ''}`,
    true,
  );
}

async function list(interaction, client) {
  if (!(await requireSlashLevel(interaction, client, 'admin'))) return;
  const filter = interaction.options.getString('status', false) || 'active';
  const records = Object.values(await getLoaRecords(client, interaction.guildId))
    .filter((record) => {
      if (filter === 'all') return true;
      if (filter === 'active') return ['pending', 'approved'].includes(record.status);
      return record.status === filter;
    })
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    .slice(0, 20);

  const description = records.length
    ? records.map((record) => [
      `**#${record.id} — ${statusLabel(record.status)}** — <@${record.userId}>`,
      `Return: **${record.returnDate}**`,
      `Reason: ${record.reason}`,
      record.reviewedBy ? `Reviewed by: <@${record.reviewedBy}>${record.reviewNote ? ` — ${record.reviewNote}` : ''}` : null,
    ].filter(Boolean).join('\n')).join('\n\n')
    : `No LOA records match **${filter}**.`;

  await replyInfo(interaction, `LOA Records — ${filter}`, description, true);
}

async function end(interaction, client) {
  const caseId = interaction.options.getInteger('case', false);
  const result = await endLoa(client, interaction.guildId, interaction.user.id, caseId);
  if (!result.ok) {
    const message = result.reason === 'not_owner'
      ? 'You can only end your own LOA request.'
      : result.reason === 'not_active'
        ? `LOA case #${result.record?.id} is no longer active.`
        : 'You do not have an active LOA request matching that case.';
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    return;
  }

  await replySuccess(interaction, 'LOA Ended', `LOA case **#${result.record.id}** has been marked as ended.`, true);
}

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('loa')
    .setDescription('Manage Leave of Absence requests')
    .setDMPermission(false)
    .addSubcommand((sub) => sub
      .setName('request')
      .setDescription('Request a Leave of Absence')
      .addStringOption((o) => o.setName('reason').setDescription('Why you need the LOA').setRequired(true).setMaxLength(500))
      .addStringOption((o) => o.setName('return_date').setDescription('Expected return date in YYYY-MM-DD format').setRequired(true).setMaxLength(10)))
    .addSubcommand((sub) => sub
      .setName('approve')
      .setDescription('Approve a pending LOA request')
      .addIntegerOption((o) => o.setName('case').setDescription('LOA case number').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('note').setDescription('Optional staff note').setRequired(false).setMaxLength(500)))
    .addSubcommand((sub) => sub
      .setName('deny')
      .setDescription('Deny a pending LOA request')
      .addIntegerOption((o) => o.setName('case').setDescription('LOA case number').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('note').setDescription('Optional staff note').setRequired(false).setMaxLength(500)))
    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('List LOA records')
      .addStringOption((o) => o.setName('status').setDescription('Records to show').setRequired(false).addChoices(
        { name: 'Active', value: 'active' },
        { name: 'Pending', value: 'pending' },
        { name: 'Approved', value: 'approved' },
        { name: 'Denied', value: 'denied' },
        { name: 'Ended', value: 'ended' },
        { name: 'All', value: 'all' },
      )))
    .addSubcommand((sub) => sub
      .setName('end')
      .setDescription('End your active LOA request')
      .addIntegerOption((o) => o.setName('case').setDescription('Optional LOA case number').setRequired(false).setMinValue(1))),
  async execute(interaction, config, client) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'request') return requestLoa(interaction, client);
    if (subcommand === 'approve') return review(interaction, client, 'approved');
    if (subcommand === 'deny') return review(interaction, client, 'denied');
    if (subcommand === 'list') return list(interaction, client);
    if (subcommand === 'end') return end(interaction, client);
  },
};
