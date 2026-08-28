// permissionGuard.js

import { PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { replyUserError, ErrorTypes } from './errorHandler.js';
import { isBotOwner, getBotMessage } from '../config/bot.js';
import { isLeoBypassed } from '../services/leo/leoState.js';

export function getCommandDefaultPermissions(commandData) {
  const json = commandData?.toJSON?.() ?? commandData;
  const value = json?.default_member_permissions;
  if (value == null || value === '0') return null;
  return BigInt(value);
}

function normalizeRoleId(role) {
  if (!role) return null;
  if (typeof role === 'string') return role;
  if (typeof role === 'object' && role.id) return role.id;
  return null;
}

function isModerationCategory(category) {
  return category?.toLowerCase?.() === 'moderation';
}

async function interactionHasLeoBypass(interaction) {
  const userId = interaction?.user?.id;
  if (!userId) return false;
  if (isBotOwner(userId)) return true;
  if (!interaction?.client) return false;
  return isLeoBypassed(interaction.client, userId).catch(() => false);
}

export function memberHasConfiguredModeratorRole(member, guildConfig) {
  if (!member || !guildConfig) return false;
  const modRoleId = normalizeRoleId(guildConfig.modRole);
  return Boolean(modRoleId && member.roles.cache.has(modRoleId));
}

export function memberHasLeoAdminAccess(member, guildConfig) {
  if (!member || !guildConfig) return false;
  const leo = guildConfig.leo || {};
  if (Array.isArray(leo.adminUsers) && leo.adminUsers.map(String).includes(String(member.id))) return true;
  const adminRoleId = normalizeRoleId(leo.adminRoleId);
  return Boolean(adminRoleId && member.roles?.cache?.has(adminRoleId));
}

export function memberHasModerationCommandAccess(member, guildConfig, requiredPermissions = null) {
  if (!member) return false;
  if (member.guild?.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (memberHasLeoAdminAccess(member, guildConfig)) return true;
  if (requiredPermissions != null && member.permissions.has(requiredPermissions)) return true;
  return memberHasConfiguredModeratorRole(member, guildConfig);
}

export function memberMeetsCommandPermissions(member, permissionBitfield, options = {}) {
  if (permissionBitfield == null) return true;
  if (!member) return false;

  const { guildConfig = null, commandCategory = null } = options;
  if (isModerationCategory(commandCategory)) {
    return memberHasModerationCommandAccess(member, guildConfig, permissionBitfield);
  }

  if (member.guild?.ownerId === member.id) return true;
  if (memberHasLeoAdminAccess(member, guildConfig)) return true;
  return member.permissions.has(permissionBitfield);
}

export async function checkModerationPermissions(
  interaction,
  guildConfig,
  requiredPermissions,
  errorMessage = 'You do not have permission to use this command.'
) {
  if (await interactionHasLeoBypass(interaction)) return true;
  if (memberHasModerationCommandAccess(interaction.member, guildConfig, requiredPermissions)) return true;

  await replyUserError(interaction, {
    type: ErrorTypes.PERMISSION,
    message: errorMessage,
    context: { source: 'permissionGuard.checkModerationPermissions' },
  });

  logger.warn('[PERMISSION_DENIED] Moderation command blocked', {
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    command: interaction.commandName,
  });
  return false;
}

export async function enforceDefaultCommandPermissions(interaction, command, context = {}) {
  if (await interactionHasLeoBypass(interaction)) return true;

  const requiredPermissions = getCommandDefaultPermissions(command?.data);
  if (requiredPermissions == null) return true;

  const member = interaction.member;
  if (memberMeetsCommandPermissions(member, requiredPermissions, {
    guildConfig: context.guildConfig ?? null,
    commandCategory: command?.category ?? null,
  })) {
    return true;
  }

  const commandName = command?.data?.name ?? interaction.commandName ?? 'command';
  await replyUserError(interaction, {
    type: ErrorTypes.PERMISSION,
    message: getBotMessage('noPermission'),
    context: {
      source: context.source ?? 'permissionGuard.enforceDefaultCommandPermissions',
      commandName,
      requiredPermissions: requiredPermissions.toString(),
    },
  });

  logger.warn('[PERMISSION_DENIED] Prefix command blocked by default_member_permissions', {
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    command: commandName,
    requiredPermissions: requiredPermissions.toString(),
  });
  return false;
}

export function isAdmin(member, guildConfig = null) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator) || memberHasLeoAdminAccess(member, guildConfig);
}

export function isModerator(member, guildConfig = null) {
  if (!member) return false;
  if (memberHasLeoAdminAccess(member, guildConfig) || memberHasConfiguredModeratorRole(member, guildConfig)) return true;
  return member.permissions.has([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild
  ]);
}

export function hasPermission(member, permissions) {
  if (!member) return false;
  return member.permissions.has(permissions);
}

export function botHasPermission(channel, permissions) {
  if (!channel || !channel.guild) return false;
  const botMember = channel.guild.members.me;
  if (!botMember) return false;
  return channel.permissionsFor(botMember).has(permissions);
}

export async function checkUserPermissions(
  interaction,
  requiredPermissions,
  errorMessage = 'You do not have permission to use this command.'
) {
  if (await interactionHasLeoBypass(interaction)) return true;
  const member = interaction.member;

  if (!member.permissions.has(requiredPermissions)) {
    await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message: errorMessage,
      context: { source: 'permissionGuard.checkUserPermissions' }
    });

    logger.warn(`[PERMISSION_DENIED] User ${member.id} attempted command ${interaction.commandName} in guild ${interaction.guildId}`);
    return false;
  }
  return true;
}

export async function checkBotPermissions(
  interaction,
  requiredPermissions,
  channel = null
) {
  const targetChannel = channel || interaction.channel;

  if (!targetChannel || !targetChannel.guild) {
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message: 'Could not determine channel.',
      context: { source: 'permissionGuard.checkBotPermissions' }
    });
    return false;
  }

  const botMember = targetChannel.guild.members.me;
  if (!botMember) {
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message: 'Could not find bot member in this guild.',
      context: { source: 'permissionGuard.checkBotPermissions' }
    });
    return false;
  }

  const permissions = targetChannel.permissionsFor(botMember);
  const missingPerms = [];
  const permArray = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  for (const perm of permArray) {
    if (!permissions.has(perm)) missingPerms.push(perm);
  }

  if (missingPerms.length > 0) {
    await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message: `I need the following permissions in ${targetChannel}: ${missingPerms.join(', ')}`,
      context: { source: 'permissionGuard.checkBotPermissions', subtype: 'bot_permission' }
    });

    logger.warn(`[BOT_PERMISSION_DENIED] Bot missing permissions [${missingPerms.join(', ')}] in channel ${targetChannel.id}`);
    return false;
  }

  return true;
}

function hashUserId(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

export function auditPermissionCheck(userId, action, allowed, reason = null) {
  const userHash = hashUserId(userId);
  if (allowed) {
    logger.debug('[PERMISSION_AUDIT] Permission granted', { action, userHash });
  } else {
    const denyReason = reason || 'insufficient_permissions';
    logger.warn('[PERMISSION_AUDIT] Permission denied', { action, userHash, reason: denyReason });
  }
}

export default {
  isAdmin,
  isModerator,
  hasPermission,
  botHasPermission,
  getCommandDefaultPermissions,
  memberHasConfiguredModeratorRole,
  memberHasLeoAdminAccess,
  memberHasModerationCommandAccess,
  memberMeetsCommandPermissions,
  checkModerationPermissions,
  enforceDefaultCommandPermissions,
  checkUserPermissions,
  checkBotPermissions,
  auditPermissionCheck
};
