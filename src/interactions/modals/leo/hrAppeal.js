import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getHrCase, updateHrCase } from '../../../services/leo/hrService.js';
import { getLeoGuildConfig } from '../../../services/leo/leoState.js';

export default {
  name: 'leo_hr_appeal_modal',
  async execute(interaction, client, args) {
    const [guildId, caseId] = args;
    const record = await getHrCase(client, guildId, caseId);
    if (!record || record.targetId !== interaction.user.id) {
      await interaction.reply({ content: 'This HR appeal is no longer available.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (record.appeal?.status === 'pending') {
      await interaction.reply({ content: 'An appeal for this case is already pending.', flags: MessageFlags.Ephemeral });
      return;
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();
    const leo = await getLeoGuildConfig(client, guildId);
    await updateHrCase(client, guildId, caseId, {
      appeal: {
        status: 'pending',
        reason,
        submittedBy: interaction.user.id,
        submittedAt: new Date().toISOString(),
      },
    });

    const guild = client.guilds.cache.get(guildId);
    const channel = leo.appealChannelId && guild
      ? guild.channels.cache.get(leo.appealChannelId) || await guild.channels.fetch(leo.appealChannelId).catch(() => null)
      : null;
    if (channel?.isTextBased?.()) {
      const pingRole = leo.appealPingRoleId ? `<@&${leo.appealPingRoleId}>` : null;
      const reviewRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`leo_hr_appeal_review:${guildId}:${caseId}:approve`)
          .setLabel('Approve Appeal')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`leo_hr_appeal_review:${guildId}:${caseId}:deny`)
          .setLabel('Deny Appeal')
          .setStyle(ButtonStyle.Danger),
      );
      await channel.send({
        content: pingRole || undefined,
        embeds: [createEmbed({
          title: `HR Appeal — Case #${caseId}`,
          description: `<@${interaction.user.id}> appealed **${record.type}**.\n\n**Original reason:** ${record.reason}\n\n**Appeal:** ${reason}`,
          color: 'warning',
        })],
        components: [reviewRow],
        allowedMentions: leo.appealPingRoleId ? { roles: [leo.appealPingRoleId] } : { parse: [] },
      });
    }

    await interaction.reply({ content: 'Your HR appeal was submitted for review.', flags: MessageFlags.Ephemeral });
  },
};
