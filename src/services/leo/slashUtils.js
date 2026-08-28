import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../../config/bot.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLeoGuildConfig, isLeoBypassed } from './leoState.js';
import { hasRole, isExplicitAdmin, levelAtLeast } from './commandUtils.js';

export async function getSlashLeoAccessLevel(interaction, client, leoConfig = null) {
  if (isBotOwner(interaction.user.id) || await isLeoBypassed(client, interaction.user.id)) return 'owner';
  const leo = leoConfig || await getLeoGuildConfig(client, interaction.guildId);
  if (interaction.guild?.ownerId === interaction.user.id) return 'admin';
  if (interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) return 'admin';
  if (isExplicitAdmin(leo, interaction.user.id)) return 'admin';
  if (hasRole(interaction.member, leo.adminRoleId)) return 'admin';
  if (hasRole(interaction.member, leo.roleManagerRoleId)) return 'rolemanager';
  return 'user';
}

export async function requireSlashLevel(interaction, client, required, leoConfig = null) {
  const level = await getSlashLeoAccessLevel(interaction, client, leoConfig);
  if (levelAtLeast(level, required)) return true;
  const payload = {
    embeds: [createEmbed({ title: 'Permission Denied', description: 'You do not have permission to use this command.', color: 'error' })],
    flags: MessageFlags.Ephemeral,
  };
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
  else await interaction.reply(payload).catch(() => {});
  return false;
}

export async function requireBotOwner(interaction, client) {
  if (isBotOwner(interaction.user.id) || await isLeoBypassed(client, interaction.user.id)) return true;
  const payload = { content: 'This command is restricted to the bot owner.', flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
  else await interaction.reply(payload).catch(() => {});
  return false;
}

export async function replySuccess(interaction, title, description, ephemeral = true, fields = []) {
  const payload = {
    embeds: [createEmbed({ title, description, color: 'success', fields })],
    ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
  };
  if (interaction.deferred) return interaction.editReply(payload);
  if (interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

export async function replyInfo(interaction, title, description, ephemeral = true, fields = []) {
  const payload = {
    embeds: [createEmbed({ title, description, color: 'info', fields })],
    ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
  };
  if (interaction.deferred) return interaction.editReply(payload);
  if (interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}
