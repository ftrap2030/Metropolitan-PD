import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { addBolo, clearBolos, getActiveBolos, removeBolo } from '../../services/leo/staffOperationsService.js';
import { requireBoloAccess } from '../../services/leo/staffOperationsAccess.js';
import { replyInfo, replySuccess } from '../../services/leo/slashUtils.js';

function typeLabel(type) {
  return { person: 'Person', vehicle: 'Vehicle', other: 'Other' }[type] || 'Other';
}

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('bolo')
    .setDescription('Manage department BOLOs')
    .setDMPermission(false)
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Create a BOLO')
      .addStringOption((o) => o.setName('type').setDescription('BOLO type').setRequired(true).addChoices(
        { name: 'Person', value: 'person' },
        { name: 'Vehicle', value: 'vehicle' },
        { name: 'Other', value: 'other' },
      ))
      .addStringOption((o) => o.setName('subject').setDescription('Person, vehicle, or subject').setRequired(true).setMaxLength(150))
      .addStringOption((o) => o.setName('details').setDescription('BOLO details').setRequired(true).setMaxLength(1500))
      .addIntegerOption((o) => o.setName('expires_hours').setDescription('Optional expiration in hours').setRequired(false).setMinValue(1).setMaxValue(168)))
    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('List active BOLOs'))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Remove a BOLO')
      .addIntegerOption((o) => o.setName('id').setDescription('BOLO record number').setRequired(true).setMinValue(1)))
    .addSubcommand((sub) => sub
      .setName('clear')
      .setDescription('Clear all active BOLOs')),
  async execute(interaction, config, client) {
    if (!(await requireBoloAccess(interaction, client))) return;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const records = await getActiveBolos(client, interaction.guildId);
      const description = records.length
        ? records.slice(0, 20).map((record) => `**#${record.id} — ${typeLabel(record.type)} — ${record.subject}**\n${record.details}\nBy: <@${record.createdBy}> • <t:${Math.floor(record.createdAt / 1000)}:R>${record.expiresAt ? ` • Expires <t:${Math.floor(record.expiresAt / 1000)}:R>` : ''}`).join('\n\n')
        : 'There are no active BOLOs.';
      await replyInfo(interaction, `Active BOLOs (${records.length})`, description, true);
      return;
    }

    if (subcommand === 'add') {
      const result = await addBolo(client, interaction.guildId, {
        type: interaction.options.getString('type', true),
        subject: interaction.options.getString('subject', true),
        details: interaction.options.getString('details', true),
        expiresHours: interaction.options.getInteger('expires_hours', false),
        createdBy: interaction.user.id,
      });
      if (!result.ok) {
        await interaction.reply({ content: 'Could not create that BOLO.', flags: MessageFlags.Ephemeral });
        return;
      }
      await replySuccess(interaction, 'BOLO Created', `**#${result.record.id} — ${typeLabel(result.record.type)} — ${result.record.subject}**\n${result.record.details}${result.record.expiresAt ? `\nExpires: <t:${Math.floor(result.record.expiresAt / 1000)}:F>` : ''}`, true);
      return;
    }

    if (subcommand === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const result = await removeBolo(client, interaction.guildId, id, interaction.user.id);
      if (!result.ok) {
        await interaction.reply({ content: `Active BOLO #${id} was not found.`, flags: MessageFlags.Ephemeral });
        return;
      }
      await replySuccess(interaction, 'BOLO Removed', `Removed BOLO **#${id} — ${result.record.subject}**.`, true);
      return;
    }

    const count = await clearBolos(client, interaction.guildId, interaction.user.id);
    await replySuccess(interaction, 'BOLOs Cleared', `Removed **${count}** active BOLO(s).`, true);
  },
};
