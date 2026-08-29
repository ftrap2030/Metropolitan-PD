import axios from 'axios';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../../config/bot.js';
import { createEmbed } from '../../utils/embeds.js';
import { getAFKKey } from '../../utils/database/keys.js';
import {
  getLeoGuildConfig,
  patchLeoGuildConfig,
  setProtectedUser,
  isProtectedUser,
  setBotBlacklist,
  getBotBlacklist,
  setDmLogUser,
  getDmLogUsers,
  setGlobalBlacklist,
  getGlobalBlacklist,
} from './leoState.js';

const COMMANDS = new Set([
  'afk',
  'adminrole',
  'rolemanagerrole',
  'joinrole',
  'promotionrole',
  'infractionrole',
  'w1role',
  'suspensionrole',
  'welcomechannel',
  'promotionchannel',
  'ticketcategory',
  'api-key',
  'apikey',
  'erlcserverinfo',
  'run',
  'raidprotect',
  'protect',
  'listserver',
  'leave',
  'invite',
  'restart',
  'repeat',
  'dmlog',
  'blacklist',
]);

function cleanId(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  const match = value.match(/^<@!?&?(\d+)>$|^<#(\d+)>$/);
  return match ? (match[1] || match[2]) : (/^\d+$/.test(value) ? value : null);
}

async function resolveRole(guild, raw) {
  const id = cleanId(raw);
  if (!id) return null;
  return guild.roles.cache.get(id) || guild.roles.fetch(id).catch(() => null);
}

async function resolveChannel(guild, raw) {
  const id = cleanId(raw);
  if (!id) return null;
  return guild.channels.cache.get(id) || guild.channels.fetch(id).catch(() => null);
}

async function resolveMember(guild, raw) {
  const id = cleanId(raw);
  if (!id) return null;
  return guild.members.cache.get(id) || guild.members.fetch(id).catch(() => null);
}

function hasRole(member, roleId) {
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

async function accessLevel(message, client, leo) {
  if (isBotOwner(message.author.id)) return 'owner';
  if (message.guild.ownerId === message.author.id) return 'admin';
  if (message.member?.permissions?.has(PermissionFlagsBits.Administrator)) return 'admin';
  if (hasRole(message.member, leo.adminRoleId)) return 'admin';
  if (hasRole(message.member, leo.roleManagerRoleId)) return 'rolemanager';
  return 'user';
}

function levelAtLeast(level, required) {
  const ranks = { user: 0, rolemanager: 1, admin: 2, owner: 3 };
  return (ranks[level] ?? 0) >= (ranks[required] ?? 0);
}

async function deny(message) {
  await message.reply('You do not have permission to use this command.').catch(() => {});
}

async function sendSuccess(message, title, description) {
  const embed = createEmbed({ title, description, color: 'success' });
  await message.channel.send({ embeds: [embed] });
}

async function sendInfo(message, title, description, fields = []) {
  const embed = createEmbed({ title, description, color: 'info', fields });
  await message.channel.send({ embeds: [embed] });
}

async function configureRole(message, client, leoKey, label, rawRole, required = 'admin') {
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const level = await accessLevel(message, client, leo);
  if (!levelAtLeast(level, required)) return deny(message);

  const role = await resolveRole(message.guild, rawRole);
  if (!role) {
    await message.reply(`Usage: \`.${label.toLowerCase().replace(/\s+/g, '')} @role\``).catch(() => {});
    return;
  }

  await patchLeoGuildConfig(client, message.guild.id, { [leoKey]: role.id });
  await sendSuccess(message, `${label} Updated`, `${role} is now the configured **${label}**.`);
}

async function configureChannel(message, client, leoKey, label, rawChannel, required = 'admin', type = null) {
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const level = await accessLevel(message, client, leo);
  if (!levelAtLeast(level, required)) return deny(message);

  const channel = await resolveChannel(message.guild, rawChannel);
  if (!channel || (type !== null && channel.type !== type)) {
    await message.reply(`Please provide a valid ${type === ChannelType.GuildCategory ? 'category' : 'channel'}.`).catch(() => {});
    return;
  }

  await patchLeoGuildConfig(client, message.guild.id, { [leoKey]: channel.id });
  await sendSuccess(message, `${label} Updated`, `${channel} is now the configured **${label}**.`);
}

async function commandAfk(message, client, args) {
  const reason = args.join(' ').trim() || 'AFK';
  if (!client.db?.set) {
    await message.reply('The database is unavailable.').catch(() => {});
    return;
  }
  await client.db.set(getAFKKey(message.guild.id, message.author.id), {
    reason,
    since: Date.now(),
  });
  await message.reply(`You are now AFK: **${reason}**`).catch(() => {});
}

async function commandApiKey(message, client, args) {
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const level = await accessLevel(message, client, leo);
  if (!levelAtLeast(level, 'admin')) return deny(message);

  const key = args[0]?.trim();
  if (!key) {
    await message.reply('Usage: `.api-key <ER:LC server key>`').catch(() => {});
    return;
  }

  await patchLeoGuildConfig(client, message.guild.id, { erlcServerKey: key });
  await message.delete().catch(() => {});
  await message.channel.send('ER:LC server key saved. The key was not echoed back.').catch(() => {});
}

async function commandErlcServerInfo(message, client) {
  const leo = await getLeoGuildConfig(client, message.guild.id);
  if (!leo.erlcServerKey) {
    await message.reply('No ER:LC API key is configured. An administrator can use `.api-key <key>`.').catch(() => {});
    return;
  }

  try {
    const response = await axios.get('https://api.erlc.gg/v2/server', {
      headers: { 'server-key': leo.erlcServerKey },
      timeout: 10000,
    });
    const data = response.data || {};
    const fields = [];
    const candidates = [
      ['Name', data.Name ?? data.name],
      ['Players', data.CurrentPlayers ?? data.currentPlayers ?? data.players],
      ['Max Players', data.MaxPlayers ?? data.maxPlayers],
      ['Join Key', data.JoinKey ?? data.joinKey],
      ['Owner ID', data.OwnerId ?? data.ownerId],
    ];
    for (const [name, value] of candidates) {
      if (value !== undefined && value !== null && typeof value !== 'object') {
        fields.push({ name, value: String(value), inline: true });
      }
    }
    if (fields.length === 0) {
      fields.push({ name: 'Server Data', value: 'Connected successfully to the ER:LC private server API.', inline: false });
    }
    await sendInfo(message, 'ER:LC Server Information', 'Live private-server information.', fields);
  } catch (error) {
    const status = error.response?.status;
    const apiMessage = error.response?.data?.message || error.response?.data?.error;
    await message.reply(`Could not fetch ER:LC server information${status ? ` (HTTP ${status})` : ''}${apiMessage ? `: ${apiMessage}` : '.'}`).catch(() => {});
  }
}

async function commandRun(message, client, args) {
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const level = await accessLevel(message, client, leo);
  if (!levelAtLeast(level, 'rolemanager')) return deny(message);
  if (!leo.erlcServerKey) {
    await message.reply('No ER:LC API key is configured.').catch(() => {});
    return;
  }

  const command = args.join(' ').trim();
  if (!command) {
    await message.reply('Usage: `.run :command arguments`').catch(() => {});
    return;
  }

  try {
    const response = await axios.post(
      'https://api.erlc.gg/v1/server/command',
      { command },
      {
        headers: {
          'server-key': leo.erlcServerKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );
    await sendSuccess(message, 'ER:LC Command Executed', `\`${command}\`\n${response.data?.message || 'Success'}`);
  } catch (error) {
    const status = error.response?.status;
    const apiMessage = error.response?.data?.message || error.response?.data?.error;
    await message.reply(`ER:LC rejected the command${status ? ` (HTTP ${status})` : ''}${apiMessage ? `: ${apiMessage}` : '.'}`).catch(() => {});
  }
}

async function commandRaidProtect(message, client, args) {
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const level = await accessLevel(message, client, leo);
  if (!levelAtLeast(level, 'admin')) return deny(message);
  const input = args[0]?.toLowerCase();
  const enabled = input === 'on' ? true : input === 'off' ? false : !leo.raidProtect;
  await patchLeoGuildConfig(client, message.guild.id, { raidProtect: enabled });
  await sendSuccess(message, 'Raid Protection', `Raid protection is now **${enabled ? 'enabled' : 'disabled'}**.`);
}

async function commandProtect(message, client, args) {
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const level = await accessLevel(message, client, leo);
  if (!levelAtLeast(level, 'admin')) return deny(message);
  const member = await resolveMember(message.guild, args[0]);
  if (!member) {
    await message.reply('Usage: `.protect @user [on|off]`').catch(() => {});
    return;
  }
  const input = args[1]?.toLowerCase();
  const currentlyProtected = isProtectedUser(leo, member.id);
  const enabled = input === 'on' ? true : input === 'off' ? false : !currentlyProtected;
  await setProtectedUser(client, message.guild.id, member.id, enabled);
  await sendSuccess(message, 'Protected User', `${member} is ${enabled ? 'now' : 'no longer'} protected from LEO moderation actions.`);
}

async function commandListServer(message, client) {
  if (!isBotOwner(message.author.id)) return deny(message);
  const guilds = [...client.guilds.cache.values()];
  const lines = guilds.slice(0, 40).map((g, i) => `${i + 1}. **${g.name}** — \`${g.id}\` — ${g.memberCount} members`);
  await sendInfo(message, `Servers (${guilds.length})`, lines.join('\n') || 'The bot is not currently in any servers.');
}

async function commandLeave(message, client, args) {
  if (!isBotOwner(message.author.id)) return deny(message);
  const guildId = cleanId(args[0]) || args[0];
  if (!guildId) {
    await message.reply('Usage: `.leave <server id>`').catch(() => {});
    return;
  }
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    await message.reply('I am not in a server with that ID.').catch(() => {});
    return;
  }
  const name = guild.name;
  await message.reply(`Leaving **${name}** (\`${guild.id}\`).`).catch(() => {});
  await guild.leave();
}

async function commandInvite(message, client) {
  if (!isBotOwner(message.author.id)) return deny(message);
  const clientId = client.user?.id || process.env.CLIENT_ID;
  const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;
  await message.reply(`Bot invite: ${url}`).catch(() => {});
}

async function commandRestart(message) {
  if (!isBotOwner(message.author.id)) return deny(message);
  await message.reply('Restarting the bot process…').catch(() => {});
  setTimeout(() => process.exit(0), 750);
}

async function commandRepeat(message, args) {
  if (!isBotOwner(message.author.id)) return deny(message);
  const text = args.join(' ').trim();
  if (!text) {
    await message.reply('Usage: `.repeat <message>`').catch(() => {});
    return;
  }
  await message.channel.send({ content: text, allowedMentions: { parse: [] } });
}

async function commandDmLog(message, client, args) {
  if (!isBotOwner(message.author.id)) return deny(message);
  const member = await resolveMember(message.guild, args[0]);
  if (!member) {
    const map = await getDmLogUsers(client);
    const ids = Object.keys(map);
    await sendInfo(message, 'DM Log Users', ids.length ? ids.map((id) => `<@${id}> (\`${id}\`)`).join('\n') : 'No users are configured.');
    return;
  }
  const map = await getDmLogUsers(client);
  const enabled = !map[member.id];
  await setDmLogUser(client, member.id, enabled, { setBy: message.author.id });
  await sendSuccess(message, 'DM Logging', `DM logging for ${member} is now **${enabled ? 'enabled' : 'disabled'}**.`);
}

async function commandBlacklist(message, client, args) {
  if (!isBotOwner(message.author.id)) return deny(message);
  const member = await resolveMember(message.guild, args[0]);
  const rawId = cleanId(args[0]);
  const userId = member?.id || rawId;
  if (!userId) {
    const map = await getGlobalBlacklist(client);
    const ids = Object.keys(map);
    await sendInfo(message, 'Global Blacklist', ids.length ? ids.map((id) => `<@${id}> (\`${id}\`)`).join('\n') : 'The global blacklist is empty.');
    return;
  }
  const map = await getGlobalBlacklist(client);
  const enabled = !map[userId];
  await setGlobalBlacklist(client, userId, enabled, { setBy: message.author.id });
  await setBotBlacklist(client, userId, enabled, { setBy: message.author.id });
  await sendSuccess(message, 'Bot Blacklist', `<@${userId}> is ${enabled ? 'now' : 'no longer'} blacklisted from using the bot.`);
}

export function isLeoPrefixCommand(commandName) {
  return COMMANDS.has(String(commandName || '').toLowerCase());
}

export async function handleLeoPrefixCommand(message, commandName, args, client) {
  const name = String(commandName || '').toLowerCase();
  if (!COMMANDS.has(name)) return false;

  switch (name) {
    case 'afk': return commandAfk(message, client, args).then(() => true);
    case 'adminrole': return configureRole(message, client, 'adminRoleId', 'Admin Role', args[0]).then(() => true);
    case 'rolemanagerrole': return configureRole(message, client, 'roleManagerRoleId', 'Role Manager Role', args[0]).then(() => true);
    case 'joinrole': return configureRole(message, client, 'joinRoleId', 'Join Role', args[0]).then(() => true);
    case 'promotionrole': return configureRole(message, client, 'promotionRoleId', 'Promotion Role', args[0]).then(() => true);
    case 'infractionrole': return configureRole(message, client, 'infractionRoleId', 'Infraction Role', args[0]).then(() => true);
    case 'w1role': return configureRole(message, client, 'w1RoleId', 'W1 Role', args[0]).then(() => true);
    case 'suspensionrole': return configureRole(message, client, 'suspensionRoleId', 'Suspension Role', args[0]).then(() => true);
    case 'welcomechannel': return configureChannel(message, client, 'welcomeChannelId', 'Welcome Channel', args[0]).then(() => true);
    case 'promotionchannel': return configureChannel(message, client, 'promotionChannelId', 'Promotion Channel', args[0]).then(() => true);
    case 'ticketcategory': return configureChannel(message, client, 'ticketCategoryId', 'Ticket Category', args[0], 'admin', ChannelType.GuildCategory).then(() => true);
    case 'api-key':
    case 'apikey': return commandApiKey(message, client, args).then(() => true);
    case 'erlcserverinfo': return commandErlcServerInfo(message, client).then(() => true);
    case 'run': return commandRun(message, client, args).then(() => true);
    case 'raidprotect': return commandRaidProtect(message, client, args).then(() => true);
    case 'protect': return commandProtect(message, client, args).then(() => true);
    case 'listserver': return commandListServer(message, client).then(() => true);
    case 'leave': return commandLeave(message, client, args).then(() => true);
    case 'invite': return commandInvite(message, client).then(() => true);
    case 'restart': return commandRestart(message).then(() => true);
    case 'repeat': return commandRepeat(message, args).then(() => true);
    case 'dmlog': return commandDmLog(message, client, args).then(() => true);
    case 'blacklist': return commandBlacklist(message, client, args).then(() => true);
    default: return false;
  }
}

export async function describeLeoConfiguration(client, guildId) {
  return getLeoGuildConfig(client, guildId);
}

export async function listLeoBlacklistedUsers(client) {
  return getBotBlacklist(client);
}
