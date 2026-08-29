import axios from 'axios';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { isBotOwner } from '../../config/bot.js';
import { createEmbed } from '../../utils/embeds.js';
import {
  getLeoGuildConfig,
  patchLeoGuildConfig,
  isLeoBypassed,
  isProtectedUser,
} from './leoState.js';
import {
  cleanDiscordId,
  manageableRoles,
  requireLevel,
  resolveMember,
  sendLeoEmbed,
  sendSuccess,
} from './commandUtils.js';
import { handleLeoOwnerPrefixCommand } from './prefixOwnerCommands.js';
import { createModerationAppeal } from './moderationAppealService.js';

const COMMANDS = new Set([
  'erlcserverinfo',
  'run',
  'raidprotect',
  'detain',
  'release',
  'blacklist',
  'lookup',
  'robloxgroup',
  'robloxlink',
]);

async function erlcServerInfo(message, client) {
  const leo = await getLeoGuildConfig(client, message.guild.id);
  if (!leo.erlcServerKey) {
    await message.reply('No ER:LC API key is configured. The bot owner can use `.api-key <key>`.').catch(() => {});
    return;
  }

  try {
    const response = await axios.get('https://api.erlc.gg/v2/server', {
      headers: { 'server-key': leo.erlcServerKey },
      timeout: 10_000,
    });
    const data = response.data || {};
    const fields = [];
    const values = [
      ['Name', data.Name ?? data.name],
      ['Players', data.CurrentPlayers ?? data.currentPlayers ?? data.players],
      ['Max Players', data.MaxPlayers ?? data.maxPlayers],
      ['Join Key', data.JoinKey ?? data.joinKey],
      ['Owner ID', data.OwnerId ?? data.ownerId],
    ];
    for (const [name, value] of values) {
      if (value !== undefined && value !== null && typeof value !== 'object') {
        fields.push({ name, value: String(value), inline: true });
      }
    }
    await sendLeoEmbed(
      message,
      'ER:LC Server Information',
      'Live private-server information.',
      'info',
      fields.length ? fields : [{ name: 'Connection', value: 'Connected successfully.', inline: false }],
    );
  } catch (error) {
    const status = error.response?.status;
    const apiMessage = error.response?.data?.message || error.response?.data?.error;
    await message.reply(`Could not fetch ER:LC server information${status ? ` (HTTP ${status})` : ''}${apiMessage ? `: ${apiMessage}` : '.'}`).catch(() => {});
  }
}

async function runErlcCommand(message, client, args) {
  if (!(await requireLevel(message, client, 'rolemanager'))) return;
  const leo = await getLeoGuildConfig(client, message.guild.id);
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
        headers: { 'server-key': leo.erlcServerKey, 'Content-Type': 'application/json' },
        timeout: 10_000,
      },
    );
    await sendSuccess(message, 'ER:LC Command Executed', `\`${command}\`\n${response.data?.message || 'Success'}`);
  } catch (error) {
    const status = error.response?.status;
    const apiMessage = error.response?.data?.message || error.response?.data?.error;
    await message.reply(`ER:LC rejected the command${status ? ` (HTTP ${status})` : ''}${apiMessage ? `: ${apiMessage}` : '.'}`).catch(() => {});
  }
}

async function raidProtect(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const input = args[0]?.toLowerCase();
  if (input && !['on', 'off'].includes(input)) {
    await message.reply('Usage: `.raidprotect <on/off>`').catch(() => {});
    return;
  }
  const enabled = input ? input === 'on' : !leo.raidProtect;
  await patchLeoGuildConfig(client, message.guild.id, { raidProtect: enabled });
  await sendSuccess(message, 'Raid Protection', `Raid protection is now **${enabled ? 'enabled' : 'disabled'}**.`);
}

async function sendDetainAppealDm(client, guild, target, staffId) {
  const appeal = await createModerationAppeal(client, guild.id, {
    kind: 'detain',
    targetId: target.id,
    staffId,
    reason: 'Member was detained and had manageable roles temporarily removed.',
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`leo_mod_appeal:${guild.id}:${appeal.id}`)
      .setLabel('Appeal Detainment')
      .setStyle(ButtonStyle.Secondary),
  );
  await target.send({
    embeds: [createEmbed({
      title: `Detainment Appeal — Case #${appeal.id}`,
      description: `You were detained in **${guild.name}**. If you believe this should be reviewed, use the button below.`,
      color: 'warning',
    })],
    components: [row],
  }).catch(() => {});
}

async function detain(message, client, args, release = false) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const target = await resolveMember(message.guild, args[0]);
  if (!target) {
    await message.reply(`Usage: \`.${release ? 'release' : 'detain'} <user>\``).catch(() => {});
    return;
  }

  const leo = await getLeoGuildConfig(client, message.guild.id);
  const explicitlyBypassed = await isLeoBypassed(client, message.author.id);
  const superuser = isBotOwner(message.author.id) || explicitlyBypassed;

  if (!release && isProtectedUser(leo, target.id) && !explicitlyBypassed) {
    await message.reply('That user is protected. Use the bypass system explicitly before taking this action.').catch(() => {});
    return;
  }

  if (!superuser) {
    if (target.id === message.guild.ownerId || target.roles.highest.position >= message.member.roles.highest.position) {
      await message.reply('You cannot use this on someone at or above your role hierarchy.').catch(() => {});
      return;
    }
  }

  const key = `leo:detain:${message.guild.id}:${target.id}`;
  const manageable = manageableRoles(message.guild);
  if (!release) {
    const held = manageable.filter((role) => target.roles.cache.has(role.id)).map((role) => role.id);
    await client.db.set(key, {
      roleIds: held,
      detainedBy: message.author.id,
      at: Date.now(),
    });
    if (held.length) await target.roles.remove(held, `Detained by ${message.author.tag}`);
    await sendSuccess(message, 'Member Detained', `Removed ${held.length} manageable role(s) from ${target}.`);
    await sendDetainAppealDm(client, message.guild, target, message.author.id);
    return;
  }

  const saved = await client.db.get(key, null);
  if (!saved?.roleIds) {
    await message.reply('No detained-role snapshot exists for that member.').catch(() => {});
    return;
  }
  const allowed = new Set(manageable.map((role) => role.id));
  const restore = saved.roleIds.filter((id) => allowed.has(id));
  if (restore.length) await target.roles.add(restore, `Released by ${message.author.tag}`);
  await client.db.delete(key);
  await sendSuccess(message, 'Member Released', `Restored ${restore.length} role(s) to ${target}.`);
}

async function protectedBlacklist(message, client, args) {
  const userId = cleanDiscordId(args[0]) || (await resolveMember(message.guild, args[0]))?.id;
  if (userId) {
    const leo = await getLeoGuildConfig(client, message.guild.id);
    const explicitlyBypassed = await isLeoBypassed(client, message.author.id);
    if (isProtectedUser(leo, userId) && !explicitlyBypassed) {
      await message.reply('That user is protected. Use the bypass system explicitly before globally blacklisting them.').catch(() => {});
      return;
    }
  }
  await handleLeoOwnerPrefixCommand(message, 'blacklist', args, client);
}

async function resolveRobloxUser(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const response = await axios.post(
      'https://users.roblox.com/v1/users',
      { userIds: [Number(value)], excludeBannedUsers: false },
      { timeout: 10_000 },
    );
    return response.data?.data?.[0] || null;
  }

  const response = await axios.post(
    'https://users.roblox.com/v1/usernames/users',
    { usernames: [value], excludeBannedUsers: false },
    { timeout: 10_000 },
  );
  return response.data?.data?.[0] || null;
}

async function robloxGroup(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const raw = args[0]?.trim();
  if (raw?.toLowerCase() === 'off') {
    await patchLeoGuildConfig(client, message.guild.id, { robloxGroupId: null });
    await sendSuccess(message, 'Roblox Group', 'Roblox group lookup is disabled for this server.');
    return;
  }
  if (!/^\d+$/.test(raw || '')) {
    await message.reply('Usage: `.robloxgroup <group id|off>`').catch(() => {});
    return;
  }
  await patchLeoGuildConfig(client, message.guild.id, { robloxGroupId: raw });
  await sendSuccess(message, 'Roblox Group', `Roblox group ID set to \`${raw}\`.`);
}

async function robloxLink(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const target = await resolveMember(message.guild, args[0]);
  const robloxRaw = args[1];
  if (!target || !robloxRaw) {
    await message.reply('Usage: `.robloxlink <Discord user> <Roblox username or ID>`').catch(() => {});
    return;
  }
  try {
    const roblox = await resolveRobloxUser(robloxRaw);
    if (!roblox?.id) {
      await message.reply('I could not find that Roblox account.').catch(() => {});
      return;
    }
    const leo = await getLeoGuildConfig(client, message.guild.id);
    const links = { ...(leo.robloxLinks || {}), [target.id]: String(roblox.id) };
    await patchLeoGuildConfig(client, message.guild.id, { robloxLinks: links });
    await sendSuccess(message, 'Roblox Link Saved', `${target} → **${roblox.name}** (\`${roblox.id}\`).`);
  } catch (error) {
    await message.reply(`Roblox lookup failed: ${error.response?.data?.errors?.[0]?.message || error.message}`).catch(() => {});
  }
}

async function lookup(message, client, args) {
  if (!(await requireLevel(message, client, 'admin'))) return;
  const target = await resolveMember(message.guild, args[0]);
  if (!target) {
    await message.reply('Usage: `.lookup <user>`').catch(() => {});
    return;
  }

  const leo = await getLeoGuildConfig(client, message.guild.id);
  const robloxId = leo.robloxLinks?.[target.id] || null;
  const fields = [
    { name: 'Discord ID', value: target.id, inline: true },
  ];

  const { getLeoAccessLevel } = await import('./commandUtils.js');
  const access = await getLeoAccessLevel({ ...message, author: target.user, member: target }, client, leo);
  fields.push({ name: 'Bot Permission Tier', value: access, inline: true });

  if (!robloxId) {
    fields.push({
      name: 'Roblox',
      value: 'No Roblox account is linked. An admin can use `.robloxlink @user <username or ID>`.',
      inline: false,
    });
    await sendLeoEmbed(message, `Lookup: ${target.user.tag}`, 'Discord, Roblox, and bot permission information.', 'info', fields);
    return;
  }

  try {
    const roblox = await resolveRobloxUser(robloxId);
    if (!roblox) throw new Error('Linked Roblox account could not be resolved.');
    fields.push({
      name: 'Roblox',
      value: `**${roblox.name}**${roblox.displayName && roblox.displayName !== roblox.name ? ` (${roblox.displayName})` : ''}\nID: \`${roblox.id}\``,
      inline: false,
    });

    const groupId = String(leo.robloxGroupId || process.env.ROBLOX_GROUP_ID || '').trim();
    if (groupId) {
      const response = await axios.get(`https://groups.roblox.com/v2/users/${roblox.id}/groups/roles`, { timeout: 10_000 });
      const membership = response.data?.data?.find((entry) => String(entry.group?.id) === groupId);
      fields.push({
        name: 'Roblox Group',
        value: membership
          ? `**${membership.group?.name || `Group ${groupId}`}**\nRole: **${membership.role?.name || 'Unknown'}**\nRank: **${membership.role?.rank ?? 'Unknown'}**`
          : `Not a member of configured group \`${groupId}\`.`,
        inline: false,
      });
    } else {
      fields.push({
        name: 'Roblox Group',
        value: 'No group is configured. Use `.robloxgroup <group id>` or set `ROBLOX_GROUP_ID`.',
        inline: false,
      });
    }
  } catch (error) {
    fields.push({ name: 'Roblox', value: `Lookup failed: ${error.message}`, inline: false });
  }

  await sendLeoEmbed(message, `Lookup: ${target.user.tag}`, 'Discord, Roblox, group, and bot permission information.', 'info', fields);
}

export function isLeoCompatibilityPrefixCommand(commandName) {
  return COMMANDS.has(String(commandName || '').toLowerCase());
}

export async function handleLeoCompatibilityPrefixCommand(message, commandName, args, client) {
  const name = String(commandName || '').toLowerCase();
  if (!COMMANDS.has(name)) return false;
  switch (name) {
    case 'erlcserverinfo': await erlcServerInfo(message, client); break;
    case 'run': await runErlcCommand(message, client, args); break;
    case 'raidprotect': await raidProtect(message, client, args); break;
    case 'detain': await detain(message, client, args, false); break;
    case 'release': await detain(message, client, args, true); break;
    case 'blacklist': await protectedBlacklist(message, client, args); break;
    case 'lookup': await lookup(message, client, args); break;
    case 'robloxgroup': await robloxGroup(message, client, args); break;
    case 'robloxlink': await robloxLink(message, client, args); break;
    default: return false;
  }
  return true;
}
