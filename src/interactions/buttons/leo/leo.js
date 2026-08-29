import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../../../config/bot.js';
import { createTicket } from '../../../services/ticket.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { getLeoGuildConfig, isLeoBypassed } from '../../../services/leo/leoState.js';

const nukeHandler = {
  name: 'leo_nuke',
  async execute(interaction, client, args) {
    const [channelId, requesterId] = args;
    if (interaction.user.id !== requesterId) {
      await interaction.reply({ content: 'Only the person who requested the nuke can confirm it.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!isBotOwner(interaction.user.id) && !(await isLeoBypassed(client, interaction.user.id))) {
      await interaction.reply({ content: 'This action is restricted to the bot owner.', flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.clone || !channel.deletable) {
      await interaction.reply({ content: 'That channel can no longer be nuked.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    const oldName = channel.name;
    const oldPosition = channel.position;
    const clone = await channel.clone({ reason: `Channel nuked by ${interaction.user.tag}` });
    await clone.setPosition(oldPosition).catch(() => {});
    await clone.send(`Channel reset by <@${interaction.user.id}>. The original **#${oldName}** was deleted.`).catch(() => {});
    await channel.delete(`Nuked by ${interaction.user.tag}`);
  },
};

const nukeCancelHandler = {
  name: 'leo_nuke_cancel',
  async execute(interaction, client, args) {
    const [, requesterId] = args;
    if (interaction.user.id !== requesterId) {
      await interaction.reply({ content: 'Only the person who requested this action can cancel it.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update({ content: 'Channel nuke cancelled.', components: [] });
  },
};

const ticketCategoryHandler = {
  name: 'leo_ticket',
  async execute(interaction, client, args) {
    const [categoryKey] = args;
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    const category = leo.ticketCategories?.[categoryKey];
    if (!category) {
      await interaction.reply({ content: 'That ticket category no longer exists.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const parentCategoryId = leo.ticketCategoryId || guildConfig.ticketCategoryId || null;
    const { channel } = await createTicket(
      interaction.guild,
      interaction.member,
      parentCategoryId,
      `Category: ${category.name}`,
      'none',
    );

    if (category.supportRoleId) {
      await channel.permissionOverwrites.edit(category.supportRoleId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      }).catch(() => {});
    }

    const ticketData = await getTicketData(interaction.guildId, channel.id);
    if (ticketData) {
      await saveTicketData(interaction.guildId, channel.id, {
        ...ticketData,
        categoryKey,
        categoryName: category.name,
        supportRoleId: category.supportRoleId || null,
        lastActivityAt: new Date().toISOString(),
      });
    }

    await interaction.editReply({ content: `Your **${category.name}** ticket was created: ${channel}` });
  },
};

export default [nukeHandler, nukeCancelHandler, ticketCategoryHandler];
