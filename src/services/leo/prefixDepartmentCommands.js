import { requireLevel, resolveMember, sendLeoEmbed, sendSuccess } from './commandUtils.js';
import {
  endShift,
  formatDuration,
  getCallsigns,
  isValidCallsign,
  setCallsign,
  startShift,
} from './departmentManagementService.js';

const COMMANDS = new Set(['onduty', 'offduty', 'callsign']);

async function onDuty(message, client) {
  const result = await startShift(client, message.guild.id, message.author.id);
  if (!result.ok) {
    const started = result.shift?.startedAt ? `<t:${Math.floor(result.shift.startedAt / 1000)}:R>` : 'earlier';
    await message.reply(`You are already on duty. Your current shift started ${started}.`).catch(() => {});
    return;
  }
  await sendSuccess(
    message,
    'Shift Started',
    `${message.author} is now **on duty**.\nStarted: <t:${Math.floor(result.shift.startedAt / 1000)}:F>`,
  );
}

async function offDuty(message, client) {
  const result = await endShift(client, message.guild.id, message.author.id);
  if (!result.ok) {
    await message.reply('You are not currently on duty. Use `!onduty` to start a shift.').catch(() => {});
    return;
  }
  await sendSuccess(
    message,
    'Shift Ended',
    `${message.author} is now **off duty**.\nShift duration: **${formatDuration(result.durationMs)}**\nCompleted shifts: **${result.stats.shiftsCompleted}**`,
  );
}

async function callsign(message, client, args) {
  if (!(await requireLevel(message, client, 'rolemanager'))) return;

  const target = await resolveMember(message.guild, args[0]);
  const raw = args[1];
  if (!target || !raw) {
    await message.reply('Usage: `!callsign <user> <callsign|off>`').catch(() => {});
    return;
  }

  if (raw.toLowerCase() === 'off' || raw.toLowerCase() === 'remove') {
    await setCallsign(client, message.guild.id, target.id, null);
    await sendSuccess(message, 'Callsign Removed', `${target} no longer has a configured callsign.`);
    return;
  }

  if (!isValidCallsign(raw)) {
    await message.reply('Callsigns must be 1-16 characters and may only contain letters, numbers, and hyphens, such as `1A-12`.').catch(() => {});
    return;
  }

  const result = await setCallsign(client, message.guild.id, target.id, raw);
  if (!result.ok && result.reason === 'duplicate') {
    await message.reply(`That callsign is already assigned to <@${result.duplicateUserId}>.`).catch(() => {});
    return;
  }
  if (!result.ok) {
    await message.reply('I could not save that callsign.').catch(() => {});
    return;
  }

  await sendSuccess(message, 'Callsign Updated', `${target} is now assigned **${result.callsign}**.`);
}

export function isDepartmentPrefixCommand(commandName) {
  return COMMANDS.has(String(commandName || '').toLowerCase());
}

export async function handleDepartmentPrefixCommand(message, commandName, args, client) {
  const name = String(commandName || '').toLowerCase();
  if (!COMMANDS.has(name)) return false;
  try {
    if (name === 'onduty') await onDuty(message, client);
    else if (name === 'offduty') await offDuty(message, client);
    else if (name === 'callsign') await callsign(message, client, args);
    return true;
  } catch (error) {
    await sendLeoEmbed(message, 'Command Failed', error.message || 'The department-management command failed.', 'error').catch(() => {});
    return true;
  }
}
