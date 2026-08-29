import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getLeoGuildConfig, isLeoBypassed } from '../../../services/leo/leoState.js';
import { isBotOwner } from '../../../config/bot.js';
import { getSlashLeoAccessLevel } from '../../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../../services/leo/commandUtils.js';

function input(customId, label, style = TextInputStyle.Short, required = true, placeholder = null) {
  const field = new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(style).setRequired(required);
  if (placeholder) field.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(field);
}

export default {
  name: 'leo_coc',
  async execute(interaction, client, args) {
    const [action, requesterId] = args;
    if (interaction.user.id !== requesterId) {
      await interaction.reply({ content: 'Only the person who opened this editor can use it.', flags: MessageFlags.Ephemeral });
      return;
    }
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const access = await getSlashLeoAccessLevel(interaction, client, leo);
    if (!levelAtLeast(access, 'admin') && !isBotOwner(interaction.user.id) && !(await isLeoBypassed(client, interaction.user.id))) {
      await interaction.reply({ content: 'You no longer have permission to edit the Chain of Command.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === 'done') {
      await interaction.update({ content: 'Chain of Command editor closed.', embeds: [], components: [] });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`leo_coc_modal:${action}:${requesterId}`)
      .setTitle(action === 'add_team' ? 'Add COC Team' : action === 'add_rank' ? 'Add COC Rank' : action === 'remove_team' ? 'Remove COC Team' : 'Remove COC Rank');

    if (action === 'add_team') {
      modal.addComponents(input('team_name', 'Team name', TextInputStyle.Short, true, 'Patrol Division'));
    } else if (action === 'add_rank') {
      modal.addComponents(
        input('team_name', 'Team name', TextInputStyle.Short, true, 'Patrol Division'),
        input('role_id', 'Rank role ID', TextInputStyle.Short, true, 'Paste the Discord role ID'),
        input('rank_limit', 'Rank limit (optional)', TextInputStyle.Short, false, 'e.g. 4'),
      );
    } else if (action === 'remove_team') {
      modal.addComponents(input('team_name', 'Team name to remove', TextInputStyle.Short, true));
    } else if (action === 'remove_rank') {
      modal.addComponents(
        input('team_name', 'Team name', TextInputStyle.Short, true),
        input('role_id', 'Rank role ID to remove', TextInputStyle.Short, true),
      );
    } else {
      await interaction.reply({ content: 'Unknown editor action.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.showModal(modal);
  },
};
