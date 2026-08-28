import { AuditLogEvent, Events, PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../config/bot.js';
import { getLeoGuildConfig, isLeoBypassed } from '../services/leo/leoState.js';
import { hasRole, isExplicitAdmin } from '../services/leo/commandUtils.js';
import { sendLeoSecurityAlert } from '../services/leo/securityAlerts.js';
import { logger } from '../utils/logger.js';

const DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
];

function isDangerous(role) {
  return DANGEROUS_PERMISSIONS.some((permission) => role.permissions.has(permission));
}

export default {
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(oldMember, newMember, client) {
    try {
      const guild = newMember.guild;
      const leo = await getLeoGuildConfig(client, guild.id);
      if (!leo.raidProtect) return;

      const added = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
      const dangerous = added.filter(isDangerous);
      if (!dangerous.size) return;

      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 8 }).catch(() => null);
      const entry = logs?.entries?.find((item) => item.target?.id === newMember.id && Date.now() - item.createdTimestamp < 7000);
      const executorId = entry?.executor?.id;
      if (!executorId || executorId === client.user.id) return;

      const executor = guild.members.cache.get(executorId) || await guild.members.fetch(executorId).catch(() => null);
      const trusted =
        executorId === guild.ownerId ||
        isBotOwner(executorId) ||
        await isLeoBypassed(client, executorId) ||
        isExplicitAdmin(leo, executorId) ||
        hasRole(executor, leo.adminRoleId);

      if (trusted) return;

      const removable = dangerous.filter((role) => role.editable);
      if (removable.size) {
        await newMember.roles.remove([...removable.keys()], 'LEO raid protection: unauthorized dangerous-role grant').catch(() => {});
      }

      if (executor?.moderatable) {
        await executor.timeout(60 * 60 * 1000, 'LEO raid protection: unauthorized dangerous-role grant').catch(() => {});
      }

      const names = dangerous.map((role) => role.name).join(', ');
      await sendLeoSecurityAlert(
        client,
        guild,
        leo,
        `LEO raid protection blocked an unauthorized dangerous-role grant by <@${executorId}> (${executorId}) to ${newMember}. Roles: ${names}.`,
        { dmSecurityUsers: true },
      );
    } catch (error) {
      logger.warn('LEO dangerous-role protection error:', error);
    }
  },
};
