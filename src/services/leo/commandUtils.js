import { PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../../config/bot.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLeoGuildConfig, isLeoBypassed } from './leoState.js';

export function cleanDiscordId(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  const mention = value.match(/^<@!?(\d+)>$|^<@&(\d+)>$|^<#(\d+)>$/);
  if (mention) return mention[1] || mention[2] || mention[3];
  return /^\d{15,22}$/.test(value) ? value : null;
}

export async function resolveMember(guild, raw) {
  const id = cleanDiscordId(raw);
  if (!id) return null;
  return guild.members.cache.get(id) || guild.members.fetch(id).catch(() => null);
}

export async function resolveRole(guild, raw) {
  const id = cleanDiscordId(raw);
  if (!id) return null;
  return guild.roles.cache.get(id) || guild.roles.fetch(id).catch(() => null);
}

export async function resolveChannel(guild, raw) {
  const id = cleanDiscordId(raw);
  if (!id) return null;
  return guild.channels.cache.get(id) || guild.channels.fetch(id).catch(() => null);
}

export function hasRole(member, roleId) {
  return Boolean(roleId && member?.roles?.cache?.has(String(roleId)));
}

export async function getLeoAccessLevel(message, client, leoConfig = null) {
  if (isBotOwner(message.author.id) || await isLeoBypassed(client, message.author.id)) return 'owner';
  const leo = leoConfig || await getLeoGuildConfig(client, message.guild.id);
  if (message.guild.ownerId === message.author.id) return 'admin';
  if (message.member?.permissions?.has(PermissionFlagsBits.Administrator)) return 'admin';
  if (hasRole(message.member, leo.adminRoleId)) return 'admin';
  if (hasRole(message.member, leo.roleManagerRoleId)) return 'rolemanager';
  return 'user';
}

export function levelAtLeast(level, required) {
  const ranks = { user: 0, rolemanager: 1, admin: 2, owner: 3 };
  return (ranks[level] ?? 0) >= (ranks[required] ?? 0);
}

export async function requireLevel(message, client, required, leoConfig = null) {
  const level = await getLeoAccessLevel(message, client, leoConfig);
  if (levelAtLeast(level, required)) return true;
  await message.reply('You do not have permission to use this command.').catch(() => {});
  return false;
}

export async function sendLeoEmbed(message, title, description, color = 'info', fields = []) {
  const embed = createEmbed({ title, description, color, fields });
  return message.channel.send({ embeds: [embed] });
}

export async function sendSuccess(message, title, description, fields = []) {
  return sendLeoEmbed(message, title, description, 'success', fields);
}

export async function sendError(message, title, description) {
  return sendLeoEmbed(message, title, description, 'error');
}

export function normalizeKeyName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function manageableRoles(guild, botMember = guild.members.me) {
  const botHighest = botMember?.roles?.highest?.position ?? 0;
  return [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed && role.position < botHighest)
    .sort((a, b) => b.position - a.position);
}
