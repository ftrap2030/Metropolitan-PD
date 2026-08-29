import { Events, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import {
  changedLines,
  getUnifiedAuditStatus,
  writeServerAudit,
} from '../services/leo/comprehensiveAuditService.js';
import { logger } from '../utils/logger.js';

const POLL_MS = 15_000;
const auditBaselines = new Map();
const warnedMissingAuditPermission = new Set();

const ACTION_NAMES = {
  1: 'Server Updated',
  10: 'Channel Created', 11: 'Channel Updated', 12: 'Channel Deleted',
  13: 'Channel Permission Added', 14: 'Channel Permission Updated', 15: 'Channel Permission Removed',
  20: 'Member Kicked', 21: 'Members Pruned', 22: 'Member Banned', 23: 'Member Unbanned',
  24: 'Member Updated', 25: 'Member Roles Updated', 26: 'Member Moved', 27: 'Member Disconnected', 28: 'Bot Added',
  30: 'Role Created', 31: 'Role Updated', 32: 'Role Deleted',
  40: 'Invite Created', 41: 'Invite Updated', 42: 'Invite Deleted',
  50: 'Webhook Created', 51: 'Webhook Updated', 52: 'Webhook Deleted',
  60: 'Emoji Created', 61: 'Emoji Updated', 62: 'Emoji Deleted',
  72: 'Message Deleted by Moderator', 73: 'Messages Bulk Deleted', 74: 'Message Pinned', 75: 'Message Unpinned',
  80: 'Integration Created', 81: 'Integration Updated', 82: 'Integration Deleted',
  83: 'Stage Instance Created', 84: 'Stage Instance Updated', 85: 'Stage Instance Deleted',
  90: 'Sticker Created', 91: 'Sticker Updated', 92: 'Sticker Deleted',
  100: 'Scheduled Event Created', 101: 'Scheduled Event Updated', 102: 'Scheduled Event Deleted',
  110: 'Thread Created', 111: 'Thread Updated', 112: 'Thread Deleted',
  121: 'Application Command Permissions Updated',
  140: 'AutoMod Rule Created', 141: 'AutoMod Rule Updated', 142: 'AutoMod Rule Deleted',
  143: 'AutoMod Blocked Message', 144: 'AutoMod Flagged Message', 145: 'AutoMod Timed Out Member',
};

function install(client, name, handler) {
  client.on(name, async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      logger.error(`Comprehensive audit handler failed for ${name}:`, error);
    }
  });
}

function stringify(value, max = 700) {
  if (value === null || value === undefined || value === '') return 'None';
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return stringify(value.map((item) => simplifyObject(item)), max);
  if (typeof value === 'object') {
    if (value.id && (value.name || value.username || value.tag)) {
      return `${value.name || value.tag || value.username} (\`${value.id}\`)`;
    }
    try {
      const text = JSON.stringify(value, (_key, nested) => typeof nested === 'bigint' ? nested.toString() : nested);
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function simplifyObject(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.id) return { id: String(value.id), name: value.name || value.username || value.tag || undefined };
  return value;
}

function auditTarget(entry) {
  const target = entry.target;
  if (!target) return 'Unknown';
  if (target.id) {
    const label = target.name || target.tag || target.username || target.code || target.id;
    return `${label} (\`${target.id}\`)`;
  }
  if (target.code) return `Invite \`${target.code}\``;
  return stringify(target, 450);
}

function auditChangeLines(entry) {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  return changes.slice(0, 12).map((change) => {
    const key = String(change.key || 'value').replaceAll('_', ' ');
    return `**${key}:** ${stringify(change.old, 300)} → ${stringify(change.new, 300)}`;
  });
}

function isDuplicateCoveredAction(entry) {
  // Existing dedicated role-create/delete listeners already log these reliably.
  if (entry.action === 30 || entry.action === 32) return true;
  // Existing guildMemberUpdate listener logs nickname changes. Keep other member updates.
  if (entry.action === 24 && entry.changes?.length && entry.changes.every((change) => change.key === 'nick')) return true;
  return false;
}

async function logDiscordAuditEntry(client, guild, entry) {
  if (isDuplicateCoveredAction(entry)) return;
  const executor = entry.executor;
  const lines = [
    `**Action:** ${ACTION_NAMES[entry.action] || `Discord Audit Action ${entry.action}`}`,
    `**Performed by:** ${executor ? `${executor} (${executor.tag || executor.username} • \`${executor.id}\`)` : 'Unknown'}`,
    `**Target:** ${auditTarget(entry)}`,
  ];
  if (entry.reason) lines.push(`**Reason:** ${stringify(entry.reason, 600)}`);
  lines.push(...auditChangeLines(entry));
  if (entry.extra) lines.push(`**Additional data:** ${stringify(simplifyObject(entry.extra), 700)}`);
  lines.push(`**Discord audit ID:** \`${entry.id}\``);

  await writeServerAudit({
    client,
    guild,
    eventType: 'discord-audit',
    title: ACTION_NAMES[entry.action] || 'Discord Audit Log Event',
    userId: entry.target?.id || null,
    lines,
  });
}

async function fetchLatestAuditId(guild) {
  if (!guild.members.me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) return null;
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1 });
    return logs.entries.first()?.id || null;
  } catch {
    return null;
  }
}

async function initializeAuditBaseline(guild) {
  const latest = await fetchLatestAuditId(guild);
  if (latest) auditBaselines.set(guild.id, latest);
}

async function pollGuildAudit(client, guild) {
  if (!guild.members.me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
    if (!warnedMissingAuditPermission.has(guild.id)) {
      warnedMissingAuditPermission.add(guild.id);
      logger.warn(`Unified audit logging in guild ${guild.id} cannot read Discord Audit Log until the bot has View Audit Log permission.`);
    }
    return;
  }
  warnedMissingAuditPermission.delete(guild.id);

  let logs;
  try {
    logs = await guild.fetchAuditLogs({ limit: 100 });
  } catch (error) {
    logger.warn(`Failed to poll Discord Audit Log for guild ${guild.id}: ${error.message}`);
    return;
  }

  const entries = [...logs.entries.values()];
  const newestId = entries[0]?.id || null;
  if (!newestId) return;

  const previousId = auditBaselines.get(guild.id);
  if (!previousId) {
    auditBaselines.set(guild.id, newestId);
    return;
  }

  const fresh = entries
    .filter((entry) => BigInt(entry.id) > BigInt(previousId))
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

  const status = await getUnifiedAuditStatus(client, guild.id);
  if (status.enabled && status.unified) {
    for (const entry of fresh) await logDiscordAuditEntry(client, guild, entry);
  }

  // Always advance the baseline, including while logging is disabled, so turning
  // logging back on never replays actions that happened while it was off.
  auditBaselines.set(guild.id, newestId);
}

function voiceFlags(state) {
  return {
    'Self muted': Boolean(state.selfMute),
    'Self deafened': Boolean(state.selfDeaf),
    'Server muted': Boolean(state.serverMute),
    'Server deafened': Boolean(state.serverDeaf),
    'Streaming': Boolean(state.streaming),
    'Camera': Boolean(state.selfVideo),
    'Stage suppressed': Boolean(state.suppress),
  };
}

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    if (client.__comprehensiveAuditInstalled) return;
    client.__comprehensiveAuditInstalled = true;

    for (const guild of client.guilds.cache.values()) await initializeAuditBaseline(guild);

    const poller = setInterval(() => {
      Promise.all([...client.guilds.cache.values()].map((guild) => pollGuildAudit(client, guild)))
        .catch((error) => logger.error('Comprehensive audit polling error:', error));
    }, POLL_MS);
    poller.unref?.();

    install(client, 'guildCreate', async (guild) => initializeAuditBaseline(guild));

    install(client, 'voiceStateUpdate', async (oldState, newState) => {
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;
      const guild = newState.guild || oldState.guild;
      const oldChannel = oldState.channel;
      const newChannel = newState.channel;

      if (oldChannel?.id !== newChannel?.id) {
        let title = 'Voice Channel Moved';
        let eventType = 'voice.move';
        if (!oldChannel && newChannel) { title = 'Voice Channel Joined'; eventType = 'voice.join'; }
        if (oldChannel && !newChannel) { title = 'Voice Channel Left'; eventType = 'voice.leave'; }
        await writeServerAudit({
          client,
          guild,
          eventType,
          title,
          userId: member.id,
          lines: [
            `**Member:** ${member} (${member.user.tag} • \`${member.id}\`)`,
            `**From:** ${oldChannel ? `${oldChannel} (#${oldChannel.name})` : 'Not connected'}`,
            `**To:** ${newChannel ? `${newChannel} (#${newChannel.name})` : 'Disconnected'}`,
          ],
        });
      }

      const before = voiceFlags(oldState);
      const after = voiceFlags(newState);
      const changes = changedLines(Object.keys(before).map((key) => ({ label: key, before: before[key], after: after[key] })));
      if (changes.length) {
        await writeServerAudit({
          client,
          guild,
          eventType: 'voice.state',
          title: 'Voice State Changed',
          userId: member.id,
          channelId: newChannel?.id || oldChannel?.id || null,
          lines: [`**Member:** ${member} (${member.user.tag} • \`${member.id}\`)`, ...changes],
        });
      }
    });

    install(client, 'guildMemberUpdate', async (oldMember, newMember) => {
      if (oldMember.pending !== newMember.pending) {
        await writeServerAudit({
          client,
          guild: newMember.guild,
          eventType: 'member.screening',
          title: 'Membership Screening Changed',
          userId: newMember.id,
          lines: [`**Member:** ${newMember} (${newMember.user.tag} • \`${newMember.id}\`)`, `**Pending screening:** ${oldMember.pending} → ${newMember.pending}`],
        });
      }
      if (oldMember.premiumSinceTimestamp !== newMember.premiumSinceTimestamp) {
        await writeServerAudit({
          client,
          guild: newMember.guild,
          eventType: 'member.boost',
          title: newMember.premiumSinceTimestamp ? 'Server Boost Started' : 'Server Boost Ended',
          userId: newMember.id,
          lines: [`**Member:** ${newMember} (${newMember.user.tag} • \`${newMember.id}\`)`],
        });
      }
    });

    install(client, 'userUpdate', async (oldUser, newUser) => {
      if (oldUser.bot) return;
      const changes = changedLines([
        { label: 'Username', before: oldUser.username, after: newUser.username },
        { label: 'Display name', before: oldUser.globalName, after: newUser.globalName },
        { label: 'Avatar hash', before: oldUser.avatar, after: newUser.avatar },
      ]);
      if (!changes.length) return;
      for (const guild of client.guilds.cache.values()) {
        if (!guild.members.cache.has(newUser.id)) continue;
        await writeServerAudit({
          client,
          guild,
          eventType: 'member.profile',
          title: 'Discord Profile Changed',
          userId: newUser.id,
          lines: [`**User:** ${newUser} (${newUser.tag} • \`${newUser.id}\`)`, ...changes],
        });
      }
    });

    install(client, 'interactionCreate', async (interaction) => {
      if (!interaction.inGuild?.() || !interaction.isChatInputCommand?.()) return;
      const sub = interaction.options.getSubcommand?.(false);
      await writeServerAudit({
        client,
        guild: interaction.guild,
        eventType: 'command.slash',
        title: 'Slash Command Used',
        userId: interaction.user.id,
        channelId: interaction.channelId,
        lines: [
          `**User:** ${interaction.user} (${interaction.user.tag} • \`${interaction.user.id}\`)`,
          `**Command:** \`/${interaction.commandName}${sub ? ` ${sub}` : ''}\``,
          `**Channel:** <#${interaction.channelId}>`,
        ],
      });
    });

    install(client, 'messageCreate', async (message) => {
      if (!message.guild || message.author.bot) return;
      const config = await getGuildConfig(client, message.guild.id);
      const prefix = String(config.prefix || '.');
      let raw = message.content || '';
      if (raw.startsWith(`<@${client.user.id}>`)) raw = raw.slice(`<@${client.user.id}>`.length).trimStart();
      else if (raw.startsWith(`<@!${client.user.id}>`)) raw = raw.slice(`<@!${client.user.id}>`.length).trimStart();
      else if (raw.startsWith(prefix)) raw = raw.slice(prefix.length);
      else return;

      const command = raw.trim().split(/\s+/)[0]?.toLowerCase();
      if (!command) return;
      // Never log prefix-command arguments. This keeps sensitive values such as
      // `.api-key <secret>` out of the audit channel by design.
      await writeServerAudit({
        client,
        guild: message.guild,
        eventType: 'command.prefix',
        title: 'Prefix Command Used',
        userId: message.author.id,
        channelId: message.channelId,
        lines: [
          `**User:** ${message.author} (${message.author.tag} • \`${message.author.id}\`)`,
          `**Command:** \`${prefix}${command}\``,
          `**Channel:** <#${message.channelId}>`,
        ],
      });
    });

    logger.info('Comprehensive one-channel server audit system installed.');
  },
};
