import { getLeoGuildConfig, patchLeoGuildConfig } from './leoState.js';
import { requireLevel, resolveChannel, resolveRole, sendLeoEmbed, sendSuccess } from './commandUtils.js';
import { formatDuration } from './departmentManagementService.js';
import { endPatrolSession, getActiveSession, startPatrolSession } from './staffOperationsService.js';
import { canHostSessionMessage } from './staffOperationsAccess.js';

const COMMANDS = new Set([
  'sessionrole', 'session', 'trainerrole', 'trainingchannel', 'traininglog', 'bolorole',
]);

async function configureRole(message, client, key, label, raw) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const role = await resolveRole(message.guild, raw);
  if (!role) {
    await message.reply(`Provide a valid role for ${label}.`).catch(() => {});
    return;
  }
  await patchLeoGuildConfig(client, message.guild.id, { [key]: role.id });
  await sendSuccess(message, `${label} Updated`, `${role} is now the configured **${label}**.`);
}

async function configureChannel(message, client, key, label, raw) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const channel = await resolveChannel(message.guild, raw);
  if (!channel?.isTextBased?.()) {
    await message.reply(`Provide a valid text channel for ${label}.`).catch(() => {});
    return;
  }
  await patchLeoGuildConfig(client, message.guild.id, { [key]: channel.id });
  await sendSuccess(message, `${label} Updated`, `${channel} is now the configured **${label}**.`);
}

async function sessionRole(message, client, args) {
  return configureRole(message, client, 'sessionHostRoleId', 'Patrol Session Host Role', args[0]);
}

async function trainerRole(message, client, args) {
  return configureRole(message, client, 'trainerRoleId', 'Trainer Role', args[0]);
}

async function trainingChannel(message, client, args) {
  return configureChannel(message, client, 'trainingChannelId', 'Training Channel', args[0]);
}

async function trainingLog(message, client, args) {
  return configureChannel(message, client, 'trainingLogChannelId', 'Training Log Channel', args[0]);
}

async function session(message, client, args) {
  const action = String(args[0] || '').toLowerCase();
  if (action === 'status') {
    const active = await getActiveSession(client, message.guild.id);
    if (!active) {
      await message.reply('There is no active patrol session.').catch(() => {});
      return;
    }
    await sendLeoEmbed(
      message,
      `Patrol Session #${active.id}`,
      `**${active.name}**\nHost: <@${active.hostId}>\nStarted: <t:${Math.floor(active.startedAt / 1000)}:R>`,
    );
    return;
  }

  if (!['start', 'end'].includes(action)) {
    await message.reply('Usage: `.session start [name]`, `.session end`, or `.session status`.').catch(() => {});
    return;
  }

  if (!(await canHostSessionMessage(message, client))) {
    const leo = await getLeoGuildConfig(client, message.guild.id);
    await message.reply(
      leo.sessionHostRoleId
        ? `You need <@&${leo.sessionHostRoleId}> or Admin access to host patrol sessions.`
        : 'No patrol session host role is configured. An Admin can set one with `.sessionrole @role`.'
    ).catch(() => {});
    return;
  }

  if (action === 'start') {
    const name = args.slice(1).join(' ').trim() || 'Patrol Session';
    const result = await startPatrolSession(client, message.guild.id, message.author.id, name);
    if (!result.ok) {
      await message.reply(`Patrol session #${result.record.id} is already active.`).catch(() => {});
      return;
    }
    await sendSuccess(
      message,
      'Patrol Session Started',
      `**${result.record.name}**\nSession: **#${result.record.id}**\nHost: ${message.author}\nStarted: <t:${Math.floor(result.record.startedAt / 1000)}:F>`,
    );
    return;
  }

  const result = await endPatrolSession(client, message.guild.id, message.author.id);
  if (!result.ok) {
    await message.reply('There is no active patrol session to end.').catch(() => {});
    return;
  }
  await sendSuccess(
    message,
    'Patrol Session Ended',
    `**${result.record.name}**\nSession: **#${result.record.id}**\nDuration: **${formatDuration(result.durationMs)}**`,
  );
}

async function boloRole(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const action = String(args[0] || '').toLowerCase();
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const roles = new Set((leo.boloRoleIds || []).map(String));

  if (action === 'list') {
    const lines = [...roles].map((id) => `<@&${id}> — \`${id}\``);
    await sendLeoEmbed(message, `BOLO Access Roles (${roles.size})`, lines.length ? lines.join('\n') : 'No BOLO access roles are configured. Admins can still use BOLO commands.');
    return;
  }

  if (!['add', 'remove'].includes(action)) {
    await message.reply('Usage: `.bolorole add @role`, `.bolorole remove @role`, or `.bolorole list`.').catch(() => {});
    return;
  }
  const role = await resolveRole(message.guild, args[1]);
  if (!role) {
    await message.reply('Provide a valid role.').catch(() => {});
    return;
  }
  if (action === 'add') roles.add(role.id);
  else roles.delete(role.id);
  await patchLeoGuildConfig(client, message.guild.id, { boloRoleIds: [...roles] });
  await sendSuccess(message, 'BOLO Access Updated', `${role} was **${action === 'add' ? 'added to' : 'removed from'}** the BOLO access list.`);
}

export function isStaffOperationsPrefixCommand(commandName) {
  return COMMANDS.has(String(commandName || '').toLowerCase());
}

export async function handleStaffOperationsPrefixCommand(message, commandName, args, client) {
  const name = String(commandName || '').toLowerCase();
  if (!COMMANDS.has(name)) return false;
  try {
    if (name === 'sessionrole') await sessionRole(message, client, args);
    else if (name === 'session') await session(message, client, args);
    else if (name === 'trainerrole') await trainerRole(message, client, args);
    else if (name === 'trainingchannel') await trainingChannel(message, client, args);
    else if (name === 'traininglog') await trainingLog(message, client, args);
    else if (name === 'bolorole') await boloRole(message, client, args);
    return true;
  } catch (error) {
    await sendLeoEmbed(message, 'Command Failed', error.message || 'The staff operations command failed.', 'error').catch(() => {});
    return true;
  }
}
