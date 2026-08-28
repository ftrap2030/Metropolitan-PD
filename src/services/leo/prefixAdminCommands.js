import {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getCommandPrefix } from '../../config/bot.js';
import { createEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../config/guildConfig.js';
import {
  getLeoGuildConfig,
  patchLeoGuildConfig,
  isProtectedUser,
  setProtectedUser,
} from './leoState.js';
import {
  cleanDiscordId,
  getLeoAccessLevel,
  levelAtLeast,
  manageableRoles,
  normalizeKeyName,
  requireLevel,
  resolveChannel,
  resolveMember,
  resolveRole,
  sendLeoEmbed,
  sendSuccess,
} from './commandUtils.js';

const ADMIN_COMMANDS = new Set([
  'ticketcategory', 'ticketpanel', 'ticketsupport', 'ticketinactivity', 'transcript',
  'welcomemessage', 'welcomechannel', 'promotionchannel', 'infractionchannel',
  'retirementchannel', 'prefix', 'role', 'renamerole', 'sendcoc', 'unmorph',
  'detain', 'release', 'setstatus', 'delete', 'snipe', 'alert', 'lookup',
  'appealchannel', 'appealping', 'status', 'selfunban', 'update', 'protect',
  'unprotect', 'protects', 'farestime', 'fedetime',
]);

async function patchTopLevel(client, guildId, patch) {
  const config = await getGuildConfig(client, guildId);
  const next = { ...config, ...patch };
  await setGuildConfig(client, guildId, next);
  return next;
}

async function setLeoChannel(message, client, key, label, raw) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const channel = await resolveChannel(message.guild, raw);
  if (!channel || !channel.isTextBased?.()) {
    await message.reply(`Usage: \`.${label.toLowerCase().replace(/\s+/g, '')} #channel\``).catch(() => {});
    return;
  }
  await patchLeoGuildConfig(client, message.guild.id, { [key]: channel.id });
  await sendSuccess(message, `${label} Updated`, `${channel} is now the configured **${label}**.`);
}

async function ticketCategory(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const categories = { ...(leo.ticketCategories || {}) };
  const action = args[0]?.toLowerCase();

  if (action === 'list') {
    const entries = Object.entries(categories);
    const body = entries.length
      ? entries.map(([key, cat]) => `**${cat.emoji || 'Ticket'} ${cat.name}** (\`${key}\`) — support: <@&${cat.supportRoleId}>${cat.description ? `\n${cat.description}` : ''}`).join('\n\n')
      : 'No ticket categories are configured.';
    await sendLeoEmbed(message, `Ticket Categories (${entries.length})`, body);
    return;
  }

  const name = args[1];
  const key = normalizeKeyName(name);
  if (!key) {
    await message.reply('Usage: `.ticketcategory add <name> <@role> [emoji] [description]`, `.ticketcategory description <name> <text>`, `.ticketcategory remove <name>`, or `.ticketcategory list`.').catch(() => {});
    return;
  }

  if (action === 'add') {
    const role = await resolveRole(message.guild, args[2]);
    if (!role) {
      await message.reply('Please provide a valid support role after the category name.').catch(() => {});
      return;
    }
    const possibleEmoji = args[3];
    const hasEmoji = possibleEmoji && !possibleEmoji.startsWith('<@') && possibleEmoji.length <= 32;
    const emoji = hasEmoji ? possibleEmoji : null;
    const descriptionStart = hasEmoji ? 4 : 3;
    const description = args.slice(descriptionStart).join(' ').trim() || null;
    categories[key] = { name, supportRoleId: role.id, emoji, description };
    await patchLeoGuildConfig(client, message.guild.id, { ticketCategories: categories });
    await sendSuccess(message, 'Ticket Category Added', `**${name}** now uses ${role} as its support role.`);
    return;
  }

  if (!categories[key]) {
    await message.reply(`No ticket category named **${name}** exists.`).catch(() => {});
    return;
  }

  if (action === 'description') {
    const description = args.slice(2).join(' ').trim();
    if (!description) {
      await message.reply('Provide the new category description.').catch(() => {});
      return;
    }
    categories[key] = { ...categories[key], description };
    await patchLeoGuildConfig(client, message.guild.id, { ticketCategories: categories });
    await sendSuccess(message, 'Ticket Category Updated', `Updated the description for **${categories[key].name}**.`);
    return;
  }

  if (action === 'remove') {
    const removed = categories[key];
    delete categories[key];
    await patchLeoGuildConfig(client, message.guild.id, { ticketCategories: categories });
    await sendSuccess(message, 'Ticket Category Removed', `Removed **${removed.name}**.`);
    return;
  }

  await message.reply('Unknown ticketcategory action. Use `add`, `description`, `remove`, or `list`.').catch(() => {});
}

async function ticketPanel(message, client) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const entries = Object.entries(leo.ticketCategories || {});
  if (!entries.length) {
    await message.reply('No ticket categories exist. Add one with `.ticketcategory add ...` first.').catch(() => {});
    return;
  }
  if (entries.length > 25) {
    await message.reply('Discord supports at most 25 categories on this picker. Remove or consolidate categories first.').catch(() => {});
    return;
  }
  const rows = [];
  for (let i = 0; i < entries.length; i += 5) {
    const row = new ActionRowBuilder();
    for (const [key, cat] of entries.slice(i, i + 5)) {
      const button = new ButtonBuilder()
        .setCustomId(`leo_ticket:${key}`)
        .setLabel(String(cat.name).slice(0, 80))
        .setStyle(ButtonStyle.Primary);
      if (cat.emoji) {
        try { button.setEmoji(cat.emoji); } catch {}
      }
      row.addComponents(button);
    }
    rows.push(row);
  }
  const embed = createEmbed({
    title: 'Support Tickets',
    description: 'Choose the category that best matches what you need help with.',
    color: 'info',
  });
  const sent = await message.channel.send({ embeds: [embed], components: rows });
  await patchLeoGuildConfig(client, message.guild.id, {
    ticketPanelChannelId: message.channel.id,
    ticketPanelMessageId: sent.id,
  });
}

async function ticketSupport(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const role = await resolveRole(message.guild, args[0]);
  if (!role) {
    await message.reply('Usage: `.ticketsupport <role>`').catch(() => {});
    return;
  }
  await patchTopLevel(client, message.guild.id, { ticketStaffRoleId: role.id });
  await patchLeoGuildConfig(client, message.guild.id, {
    ticketCategories: {
      general: { name: 'General', supportRoleId: role.id, emoji: null, description: 'General support' },
    },
  });
  await sendSuccess(message, 'Ticket Support Configured', `${role} is now the General ticket support role. Run `.ticketpanel` where you want the panel.`);
}

async function ticketInactivity(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const raw = args[0]?.toLowerCase();
  if (!['on', 'off'].includes(raw)) {
    await message.reply('Usage: `.ticketinactivity <on/off>`').catch(() => {});
    return;
  }
  const enabled = raw === 'on';
  await patchLeoGuildConfig(client, message.guild.id, { ticketInactivity: enabled, ticketInactivityHours: 24 });
  await sendSuccess(message, 'Ticket Inactivity', `24-hour inactivity auto-close is now **${enabled ? 'enabled' : 'disabled'}**.`);
}

async function transcript(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const channel = await resolveChannel(message.guild, args[0]);
  if (!channel?.isTextBased?.()) {
    await message.reply('Usage: `.transcript #channel`').catch(() => {});
    return;
  }
  const config = await getGuildConfig(client, message.guild.id);
  await setGuildConfig(client, message.guild.id, {
    ...config,
    ticketLogging: { ...(config.ticketLogging || {}), transcriptChannelId: channel.id },
  });
  await patchLeoGuildConfig(client, message.guild.id, { transcriptChannelId: channel.id });
  await sendSuccess(message, 'Transcript Channel', `Closed-ticket transcripts will be posted to ${channel}.`);
}

async function welcomeMessage(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const raw = args[0]?.toLowerCase();
  if (!['on', 'off'].includes(raw)) {
    await message.reply('Usage: `.welcomemessage <on/off>`').catch(() => {});
    return;
  }
  await patchLeoGuildConfig(client, message.guild.id, { welcomeEnabled: raw === 'on' });
  await sendSuccess(message, 'Welcome Message', `LEO welcome messages are now **${raw === 'on' ? 'enabled' : 'disabled'}**.`);
}

async function prefix(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const config = await getGuildConfig(client, message.guild.id);
  const value = args[0]?.trim() || getCommandPrefix();
  if (value.length > 5 || /\s/.test(value)) {
    await message.reply('The prefix must be 1-5 characters with no spaces.').catch(() => {});
    return;
  }
  await setGuildConfig(client, message.guild.id, { ...config, prefix: value });
  await sendSuccess(message, 'Command Prefix', `This server's prefix is now \`${value}\`.`);
}

async function rolePicker(message, client, args) {
  if (!(await requireLevel(message, client, 'rolemanager'))) return;
  const target = await resolveMember(message.guild, args[0]);
  if (!target) {
    await message.reply('Usage: `.role <user>`').catch(() => {});
    return;
  }
  const roles = manageableRoles(message.guild).slice(0, 25);
  if (!roles.length) {
    await message.reply('The bot has no manageable roles below its highest role.').catch(() => {});
    return;
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`leo_role:${target.id}:${message.author.id}`)
    .setPlaceholder(`Roles for ${target.user.username}`.slice(0, 150))
    .setMinValues(0)
    .setMaxValues(roles.length)
    .addOptions(roles.map((role) => ({
      label: role.name.slice(0, 100),
      value: role.id,
      default: target.roles.cache.has(role.id),
    })));
  await message.reply({
    content: `Select the roles ${target} should hold. Only roles the bot can manage are shown.`,
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

async function renameRole(message, client, args) {
  if (!(await requireLevel(message, client, 'rolemanager'))) return;
  const role = await resolveRole(message.guild, args[0]);
  const newName = args.slice(1).join(' ').trim();
  if (!role || !newName) {
    await message.reply('Usage: `.renamerole <role> <new name>`').catch(() => {});
    return;
  }
  if (!role.editable || (!message.member.permissions.has(PermissionFlagsBits.Administrator) && message.member.roles.highest.position <= role.position)) {
    await message.reply('That role is above your hierarchy or the bot cannot edit it.').catch(() => {});
    return;
  }
  const old = role.name;
  await role.setName(newName, `Renamed by ${message.author.tag}`);
  await sendSuccess(message, 'Role Renamed', `**${old}** → **${newName}**`);
}

async function sendCoc(message, client) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const teams = Array.isArray(leo.coc?.teams) ? leo.coc.teams : [];
  if (!teams.length) {
    await message.reply('No Chain of Command has been configured yet. Use `/coc` first.').catch(() => {});
    return;
  }
  const lines = teams.flatMap((team) => [
    `**${team.name}**`,
    ...(team.ranks || []).map((rank, index) => `${index + 1}. <@&${rank.roleId}>${rank.limit ? ` — limit ${rank.limit}` : ''}`),
  ]);
  await message.channel.send({
    embeds: [createEmbed({ title: 'Chain of Command', description: lines.join('\n'), color: 'info' })],
    allowedMentions: { parse: [] },
  });
}

async function unmorph(message, client) {
  const key = `leo:morph:${message.guild.id}:${message.author.id}`;
  const data = await client.db.get(key, null);
  if (!data?.roleIds) {
    await message.reply('You do not have a saved morph state to restore.').catch(() => {});
    return;
  }
  const manageable = new Set(manageableRoles(message.guild).map((r) => r.id));
  const restore = data.roleIds.filter((id) => manageable.has(id));
  if (restore.length) await message.member.roles.add(restore, 'Restoring .morph roles').catch(() => {});
  await client.db.delete(key);
  await sendSuccess(message, 'Morph Restored', `Restored ${restore.length} role(s).`);
}

async function detain(message, client, args, release = false) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const target = await resolveMember(message.guild, args[0]);
  if (!target) {
    await message.reply(`Usage: \`.${release ? 'release' : 'detain'} <user>\``).catch(() => {});
    return;
  }
  if (target.id === message.guild.ownerId || target.roles.highest.position >= message.member.roles.highest.position && message.guild.ownerId !== message.author.id) {
    await message.reply('You cannot use this on someone at or above your role hierarchy.').catch(() => {});
    return;
  }
  const key = `leo:detain:${message.guild.id}:${target.id}`;
  const manageable = manageableRoles(message.guild);
  if (!release) {
    const held = manageable.filter((role) => target.roles.cache.has(role.id)).map((role) => role.id);
    await client.db.set(key, { roleIds: held, detainedBy: message.author.id, at: Date.now() });
    if (held.length) await target.roles.remove(held, `Detained by ${message.author.tag}`);
    await sendSuccess(message, 'Member Detained', `Removed ${held.length} manageable role(s) from ${target}.`);
  } else {
    const saved = await client.db.get(key, null);
    if (!saved?.roleIds) {
      await message.reply('No detained-role snapshot exists for that member.').catch(() => {});
      return;
    }
    const allowed = new Set(manageable.map((r) => r.id));
    const restore = saved.roleIds.filter((id) => allowed.has(id));
    if (restore.length) await target.roles.add(restore, `Released by ${message.author.tag}`);
    await client.db.delete(key);
    await sendSuccess(message, 'Member Released', `Restored ${restore.length} role(s) to ${target}.`);
  }
}

async function setStatus(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const typeRaw = args[0]?.toLowerCase();
  const text = args.slice(1).join(' ').trim();
  if (!typeRaw || !text) {
    await message.reply('Usage: `.setstatus <playing/listening/watching/competing/custom> <text>`').catch(() => {});
    return;
  }
  const types = {
    playing: ActivityType.Playing,
    listening: ActivityType.Listening,
    watching: ActivityType.Watching,
    competing: ActivityType.Competing,
    custom: ActivityType.Custom,
  };
  if (types[typeRaw] === undefined) {
    await message.reply('Type must be playing, listening, watching, competing, or custom.').catch(() => {});
    return;
  }
  const activity = typeRaw === 'custom'
    ? { name: 'Custom Status', state: text, type: ActivityType.Custom }
    : { name: text, type: types[typeRaw] };
  client.user.setPresence({ status: 'online', activities: [activity] });
  await patchLeoGuildConfig(client, message.guild.id, { botPresence: { type: typeRaw, text } });
  await sendSuccess(message, 'Bot Status Updated', `${typeRaw}: **${text}**`);
}

async function deleteMessage(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const id = cleanDiscordId(args[0]) || args[0];
  if (!id) {
    await message.reply('Usage: `.delete <message_id>`').catch(() => {});
    return;
  }
  const target = await message.channel.messages.fetch(id).catch(() => null);
  if (!target) {
    await message.reply('I could not find that message in this channel.').catch(() => {});
    return;
  }
  await target.delete();
  await message.react('✅').catch(() => {});
}

async function snipe(message, client) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const data = await client.db.get(`leo:snipe:${message.guild.id}:${message.channel.id}`, null);
  if (!data) {
    await message.reply('There is no recently deleted message saved for this channel.').catch(() => {});
    return;
  }
  const when = Math.floor((data.deletedAt || Date.now()) / 1000);
  await sendLeoEmbed(message, 'Last Deleted Message', data.content || '*No text content*', 'info', [
    { name: 'Author', value: `<@${data.authorId}> (\`${data.authorId}\`)`, inline: true },
    { name: 'Deleted', value: `<t:${when}:R>`, inline: true },
    ...(data.attachments?.length ? [{ name: 'Attachments', value: data.attachments.join('\n').slice(0, 1024), inline: false }] : []),
  ]);
}

async function alertChannel(message, client, args) {
  return setLeoChannel(message, client, 'alertChannelId', 'Alert Channel', args[0]);
}

async function appealChannel(message, client, args) {
  return setLeoChannel(message, client, 'appealChannelId', 'Appeal Channel', args[0]);
}

async function appealPing(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  if (args[0]?.toLowerCase() === 'off') {
    await patchLeoGuildConfig(client, message.guild.id, { appealPingRoleId: null });
    await sendSuccess(message, 'Appeal Ping', 'Appeal pings are disabled.');
    return;
  }
  const role = await resolveRole(message.guild, args[0]);
  if (!role) {
    await message.reply('Usage: `.appealping <role|off>`').catch(() => {});
    return;
  }
  await patchLeoGuildConfig(client, message.guild.id, { appealPingRoleId: role.id });
  await sendSuccess(message, 'Appeal Ping', `${role} will be pinged on new appeals.`);
}

async function botStatus(message, client) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const db = client.db?.getStatus?.() || {};
  const uptime = Math.floor(process.uptime());
  await sendLeoEmbed(message, 'Bot + Server Status', `Operational status for **${message.guild.name}**.`, 'info', [
    { name: 'Bot', value: `${client.ws.ping}ms ping • ${uptime}s uptime`, inline: true },
    { name: 'Database', value: db.connectionType || 'unknown', inline: true },
    { name: 'HR System', value: leo.hrSystemEnabled === false ? 'Off' : 'On', inline: true },
    { name: 'Raid Protection', value: leo.raidProtect ? 'On' : 'Off', inline: true },
    { name: 'Ticket Inactivity', value: leo.ticketInactivity ? 'On' : 'Off', inline: true },
    { name: 'Prefix', value: `\`${(await getGuildConfig(client, message.guild.id)).prefix || getCommandPrefix()}\``, inline: true },
  ]);
}

async function selfUnban(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const guildId = cleanDiscordId(args[0]) || args[0];
  const guild = guildId ? client.guilds.cache.get(guildId) : null;
  if (!guild) {
    await message.reply('Usage: `.selfunban <guild_id>` — the bot must be in that server.').catch(() => {});
    return;
  }
  await guild.members.unban(message.author.id, `Self-unban authorized from ${message.guild.name}`);
  await sendSuccess(message, 'Self Unban', `Removed your ban from **${guild.name}**.`);
}

async function updateAnnouncement(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const text = args.join(' ').trim();
  if (!text) {
    await message.reply('Usage: `.update <changelog text>`').catch(() => {});
    return;
  }
  await message.channel.send({
    content: '@everyone',
    embeds: [createEmbed({ title: 'Development Update', description: text, color: 'info' })],
    allowedMentions: { parse: ['everyone'] },
  });
}

async function protect(message, client, args, enabled) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const target = await resolveMember(message.guild, args[0]);
  if (!target) {
    await message.reply(`Usage: \`.${enabled ? 'protect' : 'unprotect'} <user>\``).catch(() => {});
    return;
  }
  await setProtectedUser(client, message.guild.id, target.id, enabled);
  await sendSuccess(message, 'Protection Updated', `${target} is ${enabled ? 'now protected from ban/detain/blacklist and ping-spam protections' : 'no longer protected'}.`);
}

async function protects(message, client) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const ids = leo.protectedUsers || [];
  await sendLeoEmbed(message, `Protected Users (${ids.length})`, ids.length ? ids.map((id) => `<@${id}> — \`${id}\``).join('\n') : 'No users are protected.');
}

async function timeCommand(message, offsetHours, label) {
  const now = new Date(Date.now() + offsetHours * 3600000);
  const value = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    timeZone: 'UTC',
  }).format(now);
  await message.reply(`**${label}:** ${value} (UTC${offsetHours >= 0 ? '+' : ''}${offsetHours})`).catch(() => {});
}

async function lookup(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const target = await resolveMember(message.guild, args[0]);
  if (!target) {
    await message.reply('Usage: `.lookup <user>`').catch(() => {});
    return;
  }
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const access = await getLeoAccessLevel({ ...message, author: target.user, member: target }, client, leo);
  const robloxId = leo.robloxLinks?.[target.id] || null;
  await sendLeoEmbed(message, `Lookup: ${target.user.tag}`, 'Discord/LEO account information.', 'info', [
    { name: 'Discord ID', value: target.id, inline: true },
    { name: 'Bot Permission Tier', value: access, inline: true },
    { name: 'Roblox', value: robloxId ? `Linked Roblox ID: ${robloxId}` : 'No Roblox account link is configured for this user.', inline: false },
  ]);
}

export function isLeoAdminPrefixCommand(commandName) {
  return ADMIN_COMMANDS.has(String(commandName || '').toLowerCase());
}

export async function handleLeoAdminPrefixCommand(message, commandName, args, client) {
  const name = String(commandName || '').toLowerCase();
  if (!ADMIN_COMMANDS.has(name)) return false;
  switch (name) {
    case 'ticketcategory': await ticketCategory(message, client, args); break;
    case 'ticketpanel': await ticketPanel(message, client); break;
    case 'ticketsupport': await ticketSupport(message, client, args); break;
    case 'ticketinactivity': await ticketInactivity(message, client, args); break;
    case 'transcript': await transcript(message, client, args); break;
    case 'welcomemessage': await welcomeMessage(message, client, args); break;
    case 'welcomechannel': await setLeoChannel(message, client, 'welcomeChannelId', 'Welcome Channel', args[0]); break;
    case 'promotionchannel': await setLeoChannel(message, client, 'promotionChannelId', 'Promotion Channel', args[0]); break;
    case 'infractionchannel': await setLeoChannel(message, client, 'infractionChannelId', 'Infraction Channel', args[0]); break;
    case 'retirementchannel': await setLeoChannel(message, client, 'retirementChannelId', 'Retirement Channel', args[0]); break;
    case 'prefix': await prefix(message, client, args); break;
    case 'role': await rolePicker(message, client, args); break;
    case 'renamerole': await renameRole(message, client, args); break;
    case 'sendcoc': await sendCoc(message, client); break;
    case 'unmorph': await unmorph(message, client); break;
    case 'detain': await detain(message, client, args, false); break;
    case 'release': await detain(message, client, args, true); break;
    case 'setstatus': await setStatus(message, client, args); break;
    case 'delete': await deleteMessage(message, client, args); break;
    case 'snipe': await snipe(message, client); break;
    case 'alert': await alertChannel(message, client, args); break;
    case 'lookup': await lookup(message, client, args); break;
    case 'appealchannel': await appealChannel(message, client, args); break;
    case 'appealping': await appealPing(message, client, args); break;
    case 'status': await botStatus(message, client); break;
    case 'selfunban': await selfUnban(message, client, args); break;
    case 'update': await updateAnnouncement(message, client, args); break;
    case 'protect': await protect(message, client, args, true); break;
    case 'unprotect': await protect(message, client, args, false); break;
    case 'protects': await protects(message, client); break;
    case 'farestime': await timeCommand(message, 2, 'Fares Time'); break;
    case 'fedetime': await timeCommand(message, -4, 'Fede Time'); break;
    default: return false;
  }
  return true;
}
