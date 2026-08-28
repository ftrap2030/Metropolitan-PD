import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { isBotOwner } from '../../../config/bot.js';
import { manageableRoles } from '../../../services/leo/commandUtils.js';
import { getLeoGuildConfig, isLeoBypassed } from '../../../services/leo/leoState.js';
import {
  getModerationAppeal,
  updateModerationAppeal,
} from '../../../services/leo/moderationAppealService.js';

async function canReview(interaction, client, leo) {
  if (isBotOwner(interaction.user.id) || await isLeoBypassed(client, interaction.user.id)) return true;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  if (interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return Boolean(leo.infractionAppealRoleId && interaction.member?.roles?.cache?.has(leo.infractionAppealRoleId));
}

const submitAppeal = {
  name: 'leo_mod_appeal',
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

    const modal = new ModalBuilder()
      .setCustomId(`leo_mod_appeal_modal:${guildId}:${appealId}`)
      .setTitle(`${record.kind === 'ban' ? 'Ban' : 'Detainment'} Appeal #${appealId}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Why should this action be reviewed?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1500),
        ),
      );
    await interaction.showModal(modal);
  },
};

const reviewAppeal = {
  name: 'leo_mod_appeal_review',
  async execute(interaction, client, args) {
    const [guildId, appealId, decisionRaw] = args;
    const decision = String(decisionRaw || '').toLowerCase();
    if (!['approve', 'deny'].includes(decision) || interaction.guildId !== guildId) {
      await interaction.reply({ content: 'This appeal review action is invalid.', flags: MessageFlags.Ephemeral });
      return;
    }

    const leo = await getLeoGuildConfig(client, guildId);
    if (!(await canReview(interaction, client, leo))) {
      await interaction.reply({ content: 'You do not have permission to review this appeal.', flags: MessageFlags.Ephemeral });
      return;
    }

    const record = await getModerationAppeal(client, guildId, appealId);
    if (!record || record.status !== 'pending') {
      await interaction.reply({ content: `This appeal is already ${record?.status || 'closed'}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (decision === 'approve') {
      if (record.kind === 'ban') {
        await interaction.guild.members.unban(record.targetId, `Ban appeal #${appealId} approved by ${interaction.user.tag}`)
          .catch(async (error) => {
            throw new Error(`Could not unban the user: ${error.message}`);
          });
      } else if (record.kind === 'detain') {
        const member = await interaction.guild.members.fetch(record.targetId).catch(() => null);
        const key = `leo:detain:${guildId}:${record.targetId}`;
        const saved = await client.db.get(key, null);
        if (member && saved?.roleIds) {
          const allowed = new Set(manageableRoles(interaction.guild).map((role) => role.id));
          const restore = saved.roleIds.filter((id) => allowed.has(id));
          if (restore.length) {
            await member.roles.add(restore, `Detainment appeal #${appealId} approved`).catch(() => {});
          }
          await client.db.delete(key);
        }
      }
    }

    const status = decision === 'approve' ? 'approved' : 'denied';
    await updateModerationAppeal(client, guildId, appealId, {
      status,
      reviewedBy: interaction.user.id,
      reviewedAt: new Date().toISOString(),
    });

    const targetUser = await client.users.fetch(record.targetId).catch(() => null);
    if (targetUser) {
      await targetUser.send(
        `Your **${record.kind === 'ban' ? 'ban' : 'detainment'} appeal** for **${interaction.guild.name}** was **${status}**.`
      ).catch(() => {});
    }

    const original = interaction.message.embeds?.[0];
    const embed = original
      ? EmbedBuilder.from(original).addFields({
          name: 'Review Decision',
          value: `**${status.toUpperCase()}** by ${interaction.user}`,
          inline: false,
        })
      : new EmbedBuilder().setTitle(`Moderation Appeal #${appealId}`).setDescription(`**${status}** by ${interaction.user}`);

    await interaction.update({ embeds: [embed], components: [] });
  },
};

export default [submitAppeal, reviewAppeal];
