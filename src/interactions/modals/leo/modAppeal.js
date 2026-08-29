import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getLeoGuildConfig } from '../../../services/leo/leoState.js';
import {
  getModerationAppeal,
  updateModerationAppeal,
} from '../../../services/leo/moderationAppealService.js';

export default {
  name: 'leo_mod_appeal_modal',
  async execute(interaction, client, args) {
    const [guildId, appealId] = args;
    const record = await getModerationAppeal(client, guildId, appealId);
    if (!record || record.targetId !== interaction.user.id) {
      await interaction.reply({ content: 'This appeal is no longer available.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (record.status === 'pending') {
      await interaction.reply({ content: 'This appeal is already pending review.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (['approved', 'denied'].includes(record.status)) {
      await interaction.reply({ content: `This appeal has already been ${record.status}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const appealReason = interaction.fields.getTextInputValue('reason').trim();
    await updateModerationAppeal(client, guildId, appealId, {
      status: 'pending',
      appealReason,
      submittedAt: new Date().toISOString(),
    });

    const guild = client.guilds.cache.get(guildId);
    const leo = await getLeoGuildConfig(client, guildId);
    const channel = leo.appealChannelId && guild
      ? guild.channels.cache.get(leo.appealChannelId) || await guild.channels.fetch(leo.appealChannelId).catch(() => null)
      : null;

    if (channel?.isTextBased?.()) {
      const reviewRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`leo_mod_appeal_review:${guildId}:${appealId}:approve`)
          .setLabel('Approve Appeal')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`leo_mod_appeal_review:${guildId}:${appealId}:deny`)
          .setLabel('Deny Appeal')
          .setStyle(ButtonStyle.Danger),
      );
      const pingRole = leo.appealPingRoleId ? `<@&${leo.appealPingRoleId}>` : undefined;
      await channel.send({
        content: pingRole,
        embeds: [createEmbed({
          title: `${record.kind === 'ban' ? 'Ban' : 'Detainment'} Appeal — #${appealId}`,
          description:
            `User: <@${record.targetId}> (\`${record.targetId}\`)\n` +
            `Original action by: <@${record.staffId}>\n` +
            `Original reason: ${record.reason || 'No reason provided'}\n\n` +
            `**Appeal:** ${appealReason}`,
          color: 'warning',
        })],
        components: [reviewRow],
        allowedMentions: leo.appealPingRoleId ? { roles: [leo.appealPingRoleId] } : { parse: [] },
      });
    }

    await interaction.reply({
      content: channel
        ? 'Your appeal was submitted for review.'
        : 'Your appeal was saved, but no appeal channel is currently configured. Please contact server staff.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
