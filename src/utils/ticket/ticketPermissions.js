// ticketPermissions.js

import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getTicketData } from '../database.js';
import { isBotOwner } from '../../config/bot.js';
import { isLeoBypassed } from '../../services/leo/leoState.js';

export async function getTicketPermissionContext({ client, interaction }) {
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;

  const [config, ticketData] = await Promise.all([
    getGuildConfig(client, guildId),
    getTicketData(guildId, channelId)
  ]);

  const leo = config?.leo || {};
  const hasManageChannels = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
  const staffRoleId = config.ticketStaffRoleId || null;
  const hasTicketStaffRole = Boolean(staffRoleId && interaction.member.roles?.cache?.has(staffRoleId));

  const categorySupportRoleId = ticketData?.supportRoleId
    || (ticketData?.categoryKey ? leo.ticketCategories?.[ticketData.categoryKey]?.supportRoleId : null)
    || null;
  const hasCategorySupportRole = Boolean(
    categorySupportRoleId && interaction.member.roles?.cache?.has(categorySupportRoleId),
  );

  const isLeoAdmin = Boolean(
    (Array.isArray(leo.adminUsers) && leo.adminUsers.map(String).includes(String(interaction.user.id)))
    || (leo.adminRoleId && interaction.member.roles?.cache?.has(leo.adminRoleId)),
  );
  const isOwnerBypass = isBotOwner(interaction.user.id) || await isLeoBypassed(client, interaction.user.id);

  const isTicketCreator = Boolean(
    ticketData?.userId && String(ticketData.userId) === String(interaction.user.id),
  );

  const staffAccess = hasManageChannels || hasTicketStaffRole || hasCategorySupportRole || isLeoAdmin || isOwnerBypass;

  return {
    config,
    ticketData,
    hasManageChannels,
    hasTicketStaffRole,
    hasCategorySupportRole,
    isLeoAdmin,
    isOwnerBypass,
    isTicketCreator,
    canManageTicket: staffAccess,
    canCloseTicket: staffAccess || isTicketCreator,
  };
}
