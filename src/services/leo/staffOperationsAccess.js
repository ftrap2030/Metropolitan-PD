import { MessageFlags } from 'discord.js';
import { getLeoGuildConfig } from './leoState.js';
import { getSlashLeoAccessLevel } from './slashUtils.js';
import { getLeoAccessLevel, levelAtLeast } from './commandUtils.js';

function memberHasAny(member, roleIds) {
  const ids = Array.isArray(roleIds) ? roleIds.map(String) : [];
  return ids.some((id) => member?.roles?.cache?.has(id));
}

export async function canHostSessionMessage(message, client) {
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const level = await getLeoAccessLevel(message, client, leo);
  if (levelAtLeast(level, 'admin')) return true;
  return Boolean(leo.sessionHostRoleId && message.member?.roles?.cache?.has(String(leo.sessionHostRoleId)));
}

export async function canUseSessionInteraction(interaction, client) {
  const leo = await getLeoGuildConfig(client, interaction.guildId);
  const level = await getSlashLeoAccessLevel(interaction, client, leo);
  if (levelAtLeast(level, 'admin')) return true;
  return Boolean(leo.sessionHostRoleId && interaction.member?.roles?.cache?.has(String(leo.sessionHostRoleId)));
}

export async function requireSessionAccess(interaction, client) {
  if (await canUseSessionInteraction(interaction, client)) return true;
  const leo = await getLeoGuildConfig(client, interaction.guildId);
  await interaction.reply({
    content: leo.sessionHostRoleId
      ? `You need <@&${leo.sessionHostRoleId}> or Admin access to use patrol session commands.`
      : 'No patrol session role is configured. An Admin can set one with `.sessionrole @role`.',
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  return false;
}

export async function canTrainInteraction(interaction, client) {
  const leo = await getLeoGuildConfig(client, interaction.guildId);
  const level = await getSlashLeoAccessLevel(interaction, client, leo);
  if (levelAtLeast(level, 'rolemanager')) return true;
  return Boolean(leo.trainerRoleId && interaction.member?.roles?.cache?.has(String(leo.trainerRoleId)));
}

export async function requireTrainerAccess(interaction, client) {
  if (await canTrainInteraction(interaction, client)) return true;
  await interaction.reply({
    content: 'You need the configured Trainer role or Role Manager+ access to use this command.',
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  return false;
}

export async function requireTrainingChannel(interaction, client) {
  const leo = await getLeoGuildConfig(client, interaction.guildId);
  if (!leo.trainingChannelId || interaction.channelId === String(leo.trainingChannelId)) return true;
  await interaction.reply({
    content: `Training actions must be used in <#${leo.trainingChannelId}>.`,
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  return false;
}

export async function canUseBolo(interaction, client) {
  const leo = await getLeoGuildConfig(client, interaction.guildId);
  const level = await getSlashLeoAccessLevel(interaction, client, leo);
  if (levelAtLeast(level, 'admin')) return true;
  return memberHasAny(interaction.member, leo.boloRoleIds);
}

export async function requireBoloAccess(interaction, client) {
  if (await canUseBolo(interaction, client)) return true;
  const leo = await getLeoGuildConfig(client, interaction.guildId);
  const configured = Array.isArray(leo.boloRoleIds) && leo.boloRoleIds.length > 0;
  await interaction.reply({
    content: configured
      ? 'You do not have one of the configured BOLO roles.'
      : 'No BOLO access roles are configured. An Admin can configure them with `.bolorole add @role`.',
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  return false;
}

export async function postTrainingLog(interaction, client, title, description) {
  const leo = await getLeoGuildConfig(client, interaction.guildId);
  if (!leo.trainingLogChannelId) return null;
  const channel = await interaction.guild.channels.fetch(String(leo.trainingLogChannelId)).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  return channel.send({ content: `**${title}**\n${description}`, allowedMentions: { parse: [] } }).catch(() => null);
}
