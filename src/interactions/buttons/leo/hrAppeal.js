import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getHrCase } from '../../../services/leo/hrService.js';

export default {
  name: 'leo_hr_appeal',
  async execute(interaction, client, args) {
    const [guildId, caseId] = args;
    const record = await getHrCase(client, guildId, caseId);
    if (!record || record.kind !== 'infraction') {
      await interaction.reply({ content: 'This HR case no longer exists.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (record.targetId !== interaction.user.id) {
      await interaction.reply({ content: 'Only the person who received this infraction can appeal it.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (record.status === 'revoked') {
      await interaction.reply({ content: 'This infraction has already been revoked.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (record.appeal?.status === 'pending') {
      await interaction.reply({ content: 'An appeal for this case is already pending.', flags: MessageFlags.Ephemeral });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`leo_hr_appeal_modal:${guildId}:${caseId}`)
      .setTitle(`Appeal HR Case #${caseId}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Why should this infraction be reviewed?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1500),
        ),
      );
    await interaction.showModal(modal);
  },
};
