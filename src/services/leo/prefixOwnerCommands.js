import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { isBotOwner } from '../../config/bot.js';
import {
  getLeoGuildConfig,
  patchLeoGuildConfig,
  getBypassMap,
  isLeoBypassed,
  setLeoBypass,
  getBotBlacklist,
  setBotBlacklist,
  getDmLogUsers,
  setDmLogUser,
  getGlobalBlacklist,
  setGlobalBlacklist,
} from './leoState.js';
import {
  cleanDiscordId,
  resolveMember,
  resolveRole,
  sendLeoEmbed,
  sendSuccess,
} from './commandUtils.js';

const OWNER_COMMANDS = new Set([
  'hrsystem', 'bypass', 'bypasslist', 'botblacklist', 'unbotblacklist',
  'dmlog', 'undmlog', 'testwebhook', 'repeat', 'nuke', 'invite',
  'blacklist', 'unblacklist', 'infractionappealrole', 'w2role', 's1role',
  's2role', 'termrole', 'activitywatchrole',
]);

async function isOwnerEquivalent(message, client) {
  return isBotOwner(message.author.id) || await isLeoBypassed(client, message.author.id);
}

async function requireOwner(message, client) {
  if (await isOwnerEquivalent(message, client)) return true;
  await message.reply('This command is restricted to the bot owner.').catch(() => {});
  return false;
}

async function configureOwnerRole(message, client, key, label, raw) {
  if (!(await requireOwner(message, client))) return;
  const role = await resolveRole(message.guild, raw);
  if (!role) {
    await message.reply(`Usage: \`.${key.replace(/RoleId$/, '').toLowerCase()} @role\``).catch(() => {});
    return;
  }
  await patchLeoGuildConfig(client, message.guild.id, { [key]: role.id });
  await sendSuccess(message, `${label} Updated`, `${role} is now the configured **${label}**.`);
}

async function hrSystem(message, client, args) {
  if (!(await requireOwner(message, client))) return;
  const leo = await getLeoGuildConfig(client, message.guild.id);
  const raw = args[0]?.toLowerCase();
  if (!['on', 'off'].includes(raw)) {
    await message.reply('Usage: `.hrsystem <on/off>`').catch(() => {});
    return;
  }
  const enabled = raw === 'on';
  await patchLeoGuildConfig(client, message.guild.id, { hrSystemEnabled: enabled });
  await sendSuccess(message, 'HR System', `The HR module is now **${enabled ? 'enabled' : 'disabled'}** for this server.`);
}

async function bypass(message, client, args) {
  if (!(await requireOwner(message, client))) return;
  const member = await resolveMember(message.guild, args[0]);
  const userId = member?.id || cleanDiscordId(args[0]);
  if (!userId) {
    await message.reply('Usage: `.bypass <user>`').catch(() => {});
    return;
  }
  const map = await getBypassMap(client);
  const enabled = !map[userId];
  await setLeoBypass(client, userId, enabled, { setBy: message.author.id });
  await sendSuccess(message, 'Bypass Updated', `<@${userId}> ${enabled ? 'now bypasses bot permission, protection, hierarchy, and blacklist checks' : 'no longer bypasses bot checks'}.`);
}

async function bypassList(message, client) {
  if (!(await requireOwner(message, client))) return;
  const map = await getBypassMap(client);
  const ids = Object.keys(map);
  await sendLeoEmbed(
    message,
    `Bypass List (${ids.length})`,
    ids.length ? ids.map((id) => `<@${id}> — \`${id}\``).join('\n') : 'No users are currently bypassed.',
  );
}

async function botBlacklist(message, client, args, enabled) {
  if (!(await requireOwner(message, client))) return;
  const member = await resolveMember(message.guild, args[0]);
  const userId = member?.id || cleanDiscordId(args[0]);
  if (!userId) {
    await message.reply(`Usage: \`.${enabled ? 'botblacklist' : 'unbotblacklist'} <user>${enabled ? ' [reason]' : ''}\``).catch(() => {});
    return;
  }
  if (isBotOwner(userId)) {
    await message.reply('A configured bot owner cannot be bot-blacklisted.').catch(() => {});
    return;
  }
  const reason = args.slice(1).join(' ').trim() || 'No reason provided';
  await setBotBlacklist(client, userId, enabled, { reason, setBy: message.author.id });
  await sendSuccess(message, 'Bot Blacklist', `<@${userId}> is **${enabled ? 'blocked from' : 'allowed to use'}** bot commands.${enabled ? `\nReason: ${reason}` : ''}`);
}

async function dmLog(message, client, args, enabled) {
  if (!(await requireOwner(message, client))) return;
  const member = await resolveMember(message.guild, args[0]);
  const userId = member?.id || cleanDiscordId(args[0]);
  if (!userId) {
    await message.reply(`Usage: \`.${enabled ? 'dmlog' : 'undmlog'} <user>\``).catch(() => {});
    return;
  }
  await setDmLogUser(client, userId, enabled, { setBy: message.author.id });
  await sendSuccess(message, 'Security DM Recipients', `<@${userId}> will ${enabled ? 'now' : 'no longer'} receive protect-trigger and unauthorized-server security DMs.`);
}

async function listDmLog(message, client) {
  const map = await getDmLogUsers(client);
  return Object.keys(map);
}

async function repeat(message, client, args) {
  if (!(await requireOwner(message, client))) return;
  const count = Number.parseInt(args[0], 10);
  const text = args.slice(1).join(' ').trim();
  if (!Number.isInteger(count) || count < 1 || count > 20 || !text) {
    await message.reply('Usage: `.repeat <count 1-20> <message>`').catch(() => {});
    return;
  }
  for (let i = 0; i < count; i += 1) {
    await message.channel.send({ content: text, allowedMentions: { parse: [] } });
  }
}

async function nuke(message, client) {
  if (!(await requireOwner(message, client))) return;
  if (!message.channel?.clone || !message.channel?.deletable) {
    await message.reply('This channel cannot be nuked.').catch(() => {});
    return;
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`leo_nuke:${message.channel.id}:${message.author.id}`)
      .setLabel('Confirm Nuke')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`leo_nuke_cancel:${message.channel.id}:${message.author.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  await message.reply({
    content: 'This will clone this channel and delete the original, wiping its message history. Confirm?',
    components: [row],
  });
}

async function invite(message, client, args) {
  if (!(await requireOwner(message, client))) return;
  const guildId = cleanDiscordId(args[0]) || args[0];
  const guild = guildId ? client.guilds.cache.get(guildId) : null;
  if (!guild) {
    await message.reply('Usage: `.invite <guild_id>` — the bot must already be in that server.').catch(() => {});
    return;
  }
  const me = guild.members.me;
  const channel = guild.channels.cache
    .filter((c) => c.isTextBased?.() && c.viewable)
    .find((c) => c.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite));
  if (!channel) {
    await message.reply('I cannot create an invite in that server because no accessible channel grants Create Invite.').catch(() => {});
    return;
  }
  const created = await channel.createInvite({
    maxAge: 300,
    maxUses: 1,
    unique: true,
    reason: `Short-lived owner invite requested by ${message.author.tag}`,
  });
  await message.reply(`Short-lived invite for **${guild.name}** (5 minutes, 1 use): ${created.url}`).catch(() => {});
}

async function globalBlacklist(message, client, args, enabled) {
  if (!(await requireOwner(message, client))) return;
  const member = await resolveMember(message.guild, args[0]);
  const userId = member?.id || cleanDiscordId(args[0]);
  if (!userId) {
    await message.reply(`Usage: \`.${enabled ? 'blacklist' : 'unblacklist'} <user>${enabled ? ' [reason]' : ''}\``).catch(() => {});
    return;
  }
  if (isBotOwner(userId)) {
    await message.reply('A configured bot owner cannot be globally blacklisted.').catch(() => {});
    return;
  }
  const reason = args.slice(1).join(' ').trim() || 'Global bot blacklist';
  const results = [];
  for (const guild of client.guilds.cache.values()) {
    try {
      if (enabled) {
        await guild.members.ban(userId, { reason });
        results.push(`Banned: ${guild.name}`);
      } else {
        await guild.members.unban(userId, `Global blacklist reversed by ${message.author.tag}`).catch((error) => {
          if (error?.code !== 10026) throw error;
        });
        results.push(`Unbanned: ${guild.name}`);
      }
    } catch (error) {
      results.push(`Failed: ${guild.name} (${error.message})`);
    }
  }
  await setGlobalBlacklist(client, userId, enabled, { reason, setBy: message.author.id });
  await setBotBlacklist(client, userId, enabled, { reason, setBy: message.author.id });
  const successes = results.filter((line) => !line.startsWith('Failed:')).length;
  const failures = results.length - successes;
  await sendSuccess(message, enabled ? 'Global Blacklist Applied' : 'Global Blacklist Reversed', `<@${userId}>: ${successes} server action(s) succeeded, ${failures} failed.${enabled ? `\nReason: ${reason}` : ''}`);
}

async function testWebhook(message, client) {
  if (!(await requireOwner(message, client))) return;
  if (!message.channel?.createWebhook) {
    await message.reply('This channel does not support webhooks.').catch(() => {});
    return;
  }
  const leo = await getLeoGuildConfig(client, message.guild.id);
  if (!leo.raidProtect) {
    await message.reply('Enable `.raidprotect on` first so this test can verify the protection.').catch(() => {});
    return;
  }
  let webhook;
  try {
    webhook = await message.channel.createWebhook({ name: 'LEO Protection Test', reason: 'LEO raid protection test' });
    for (let i = 1; i <= 6; i += 1) {
      await webhook.send({ content: `LEO webhook protection test ${i}/6`, allowedMentions: { parse: [] } });
    }
    await message.reply('Webhook protection test fired. Check the configured alert channel/security logs for the result.').catch(() => {});
  } finally {
    if (webhook) await webhook.delete('LEO protection test cleanup').catch(() => {});
  }
}

export function isLeoOwnerPrefixCommand(commandName) {
  return OWNER_COMMANDS.has(String(commandName || '').toLowerCase());
}

export async function handleLeoOwnerPrefixCommand(message, commandName, args, client) {
  const name = String(commandName || '').toLowerCase();
  if (!OWNER_COMMANDS.has(name)) return false;
  switch (name) {
    case 'hrsystem': await hrSystem(message, client, args); break;
    case 'bypass': await bypass(message, client, args); break;
    case 'bypasslist': await bypassList(message, client); break;
    case 'botblacklist': await botBlacklist(message, client, args, true); break;
    case 'unbotblacklist': await botBlacklist(message, client, args, false); break;
    case 'dmlog': await dmLog(message, client, args, true); break;
    case 'undmlog': await dmLog(message, client, args, false); break;
    case 'repeat': await repeat(message, client, args); break;
    case 'nuke': await nuke(message, client); break;
    case 'invite': await invite(message, client, args); break;
    case 'blacklist': await globalBlacklist(message, client, args, true); break;
    case 'unblacklist': await globalBlacklist(message, client, args, false); break;
    case 'testwebhook': await testWebhook(message, client); break;
    case 'infractionappealrole': await configureOwnerRole(message, client, 'infractionAppealRoleId', 'Infraction Appeal Role', args[0]); break;
    case 'w2role': await configureOwnerRole(message, client, 'w2RoleId', 'W2 Role', args[0]); break;
    case 's1role': await configureOwnerRole(message, client, 's1RoleId', 'S1 Role', args[0]); break;
    case 's2role': await configureOwnerRole(message, client, 's2RoleId', 'S2 Role', args[0]); break;
    case 'termrole': await configureOwnerRole(message, client, 'termRoleId', 'Termination Role', args[0]); break;
    case 'activitywatchrole': await configureOwnerRole(message, client, 'activityWatchRoleId', 'Activity Watch Role', args[0]); break;
    default: return false;
  }
  return true;
}

export { listDmLog };
