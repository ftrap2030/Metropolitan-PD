import { Events } from 'discord.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import {
  changedLines,
  executorLines,
  findAuditExecutor,
  roleList,
  writeServerAudit,
} from '../services/leo/comprehensiveAuditService.js';
import { logger } from '../utils/logger.js';

// Discord audit-log action type values. Numeric values keep this compatible
// across discord.js minor versions where enum names have changed.
const AUDIT = {
  GUILD_UPDATE: 1,
  CHANNEL_CREATE: 10,
  CHANNEL_UPDATE: 11,
  CHANNEL_DELETE: 12,
  MEMBER_BAN_ADD: 22,
  MEMBER_BAN_REMOVE: 23,
  MEMBER_UPDATE: 24,
  MEMBER_ROLE_UPDATE: 25,
  MEMBER_MOVE: 26,
  ROLE_UPDATE: 31,
  INVITE_CREATE: 40,
  INVITE_DELETE: 42,
  WEBHOOK_CREATE: 50,
  WEBHOOK_UPDATE: 51,
  WEBHOOK_DELETE: 52,
  EMOJI_CREATE: 60,
  EMOJI_UPDATE: 61,
  EMOJI_DELETE: 62,
  STICKER_CREATE: 90,
  STICKER_UPDATE: 91,
  STICKER_DELETE: 92,
  SCHEDULED_EVENT_CREATE: 100,
  SCHEDULED_EVENT_UPDATE: 101,
  SCHEDULED_EVENT_DELETE: 102,
  THREAD_CREATE: 110,
  THREAD_UPDATE: 111,
  THREAD_DELETE: 112,
  AUTOMOD_RULE_CREATE: 140,
  AUTOMOD_RULE_UPDATE: 141,
  AUTOMOD_RULE_DELETE: 142,
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

function channelLabel(channel) {
  if (!channel) return 'Unknown';
  const mention = channel.isThread?.() ? `<#${channel.id}>` : `<#${channel.id}>`;
  return `${mention} (${channel.name || 'unnamed'} • \`${channel.id}\`)`;
}

function permissionsSnapshot(channel) {
  if (!channel?.permissionOverwrites?.cache) return 'None';
  return channel.permissionOverwrites.cache
    .map((overwrite) => `${overwrite.id}:${overwrite.type}:${overwrite.allow.bitfield}:${overwrite.deny.bitfield}`)
    .sort()
    .join('|') || 'None';
}

async function actorFor(guild, type, targetId) {
  return executorLines(await findAuditExecutor(guild, type, targetId));
}

function voiceFlags(state) {
  return {
    selfMute: Boolean(state.selfMute),
    selfDeaf: Boolean(state.selfDeaf),
    serverMute: Boolean(state.serverMute),
    serverDeaf: Boolean(state.serverDeaf),
    streaming: Boolean(state.streaming),
    video: Boolean(state.selfVideo),
    suppressed: Boolean(state.suppress),
  };
}

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    if (client.__comprehensiveAuditInstalled) return;
    client.__comprehensiveAuditInstalled = true;

    install(client, 'channelCreate', async (channel) => {
      if (!channel.guild) return;
      const actor = await actorFor(channel.guild, AUDIT.CHANNEL_CREATE, channel.id);
      await writeServerAudit({
        client,
        guild: channel.guild,
        eventType: 'channel.create',
        title: 'Channel Created',
        channelId: channel.id,
        lines: [
          `**Channel:** ${channelLabel(channel)}`,
          `**Type:** ${channel.type}`,
          `**Category:** ${channel.parentId ? `<#${channel.parentId}>` : 'None'}`,
          ...actor,
        ],
      });
    });

    install(client, 'channelUpdate', async (oldChannel, newChannel) => {
      if (!newChannel.guild) return;
      const changes = changedLines([
        { label: 'Name', before: oldChannel.name, after: newChannel.name },
        { label: 'Category', before: oldChannel.parentId ? `<#${oldChannel.parentId}>` : 'None', after: newChannel.parentId ? `<#${newChannel.parentId}>` : 'None' },
        { label: 'Topic', before: oldChannel.topic, after: newChannel.topic },
        { label: 'NSFW', before: oldChannel.nsfw, after: newChannel.nsfw },
        { label: 'Slowmode', before: oldChannel.rateLimitPerUser, after: newChannel.rateLimitPerUser },
        { label: 'Bitrate', before: oldChannel.bitrate, after: newChannel.bitrate },
        { label: 'User limit', before: oldChannel.userLimit, after: newChannel.userLimit },
        { label: 'Permissions', before: permissionsSnapshot(oldChannel), after: permissionsSnapshot(newChannel) },
      ]);
      if (!changes.length) return;
      const actor = await actorFor(newChannel.guild, AUDIT.CHANNEL_UPDATE, newChannel.id);
      await writeServerAudit({
        client,
        guild: newChannel.guild,
        eventType: 'channel.update',
        title: 'Channel Updated',
        channelId: newChannel.id,
        lines: [`**Channel:** ${channelLabel(newChannel)}`, ...changes, ...actor],
      });
    });

    install(client, 'channelDelete', async (channel) => {
      if (!channel.guild) return;
      const actor = await actorFor(channel.guild, AUDIT.CHANNEL_DELETE, channel.id);
      await writeServerAudit({
        client,
        guild: channel.guild,
        eventType: 'channel.delete',
        title: 'Channel Deleted',
        lines: [
          `**Channel:** #${channel.name || 'unnamed'} (\`${channel.id}\`)`,
          `**Type:** ${channel.type}`,
          `**Category:** ${channel.parentId ? `\`${channel.parentId}\`` : 'None'}`,
          ...actor,
        ],
      });
    });

    install(client, 'roleUpdate', async (oldRole, newRole) => {
      const changes = changedLines([
        { label: 'Name', before: oldRole.name, after: newRole.name },
        { label: 'Color', before: oldRole.hexColor, after: newRole.hexColor },
        { label: 'Hoisted', before: oldRole.hoist, after: newRole.hoist },
        { label: 'Mentionable', before: oldRole.mentionable, after: newRole.mentionable },
        { label: 'Position', before: oldRole.position, after: newRole.position },
        { label: 'Permissions', before: oldRole.permissions.bitfield.toString(), after: newRole.permissions.bitfield.toString() },
      ]);
      if (!changes.length) return;
      const actor = await actorFor(newRole.guild, AUDIT.ROLE_UPDATE, newRole.id);
      await writeServerAudit({
        client,
        guild: newRole.guild,
        eventType: 'role.update',
        title: 'Role Updated',
        lines: [`**Role:** ${newRole} (\`${newRole.id}\`)`, ...changes, ...actor],
      });
    });

    install(client, 'guildBanAdd', async (ban) => {
      const actor = await actorFor(ban.guild, AUDIT.MEMBER_BAN_ADD, ban.user.id);
      await writeServerAudit({
        client,
        guild: ban.guild,
        eventType: 'member.ban',
        title: 'Member Banned',
        userId: ban.user.id,
        lines: [`**User:** ${ban.user} (${ban.user.tag} • \`${ban.user.id}\`)`, `**Ban reason:** ${ban.reason || 'None provided'}`, ...actor],
      });
    });

    install(client, 'guildBanRemove', async (ban) => {
      const actor = await actorFor(ban.guild, AUDIT.MEMBER_BAN_REMOVE, ban.user.id);
      await writeServerAudit({
        client,
        guild: ban.guild,
        eventType: 'member.unban',
        title: 'Member Unbanned',
        userId: ban.user.id,
        lines: [`**User:** ${ban.user} (${ban.user.tag} • \`${ban.user.id}\`)`, ...actor],
      });
    });

    install(client, 'guildMemberUpdate', async (oldMember, newMember) => {
      const oldRoles = oldMember.roles.cache.filter((role) => role.id !== oldMember.guild.id);
      const newRoles = newMember.roles.cache.filter((role) => role.id !== newMember.guild.id);
      const added = newRoles.filter((role) => !oldRoles.has(role.id));
      const removed = oldRoles.filter((role) => !newRoles.has(role.id));

      if (added.size || removed.size) {
        const actor = await actorFor(newMember.guild, AUDIT.MEMBER_ROLE_UPDATE, newMember.id);
        await writeServerAudit({
          client,
          guild: newMember.guild,
          eventType: 'member.roles',
          title: 'Member Roles Changed',
          userId: newMember.id,
          lines: [
            `**Member:** ${newMember} (${newMember.user.tag} • \`${newMember.id}\`)`,
            `**Added:** ${roleList(added.values())}`,
            `**Removed:** ${roleList(removed.values())}`,
            ...actor,
          ],
        });
      }

      if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
        const actor = await actorFor(newMember.guild, AUDIT.MEMBER_UPDATE, newMember.id);
        const before = oldMember.communicationDisabledUntilTimestamp ? `<t:${Math.floor(oldMember.communicationDisabledUntilTimestamp / 1000)}:F>` : 'Not timed out';
        const after = newMember.communicationDisabledUntilTimestamp ? `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>` : 'Not timed out';
        await writeServerAudit({
          client,
          guild: newMember.guild,
          eventType: 'member.timeout',
          title: 'Member Timeout Changed',
          userId: newMember.id,
          lines: [`**Member:** ${newMember} (\`${newMember.id}\`)`, `**Before:** ${before}`, `**After:** ${after}`, ...actor],
        });
      }

      if (oldMember.pending !== newMember.pending) {
        await writeServerAudit({
          client,
          guild: newMember.guild,
          eventType: 'member.screening',
          title: 'Membership Screening Changed',
          userId: newMember.id,
          lines: [`**Member:** ${newMember} (\`${newMember.id}\`)`, `**Pending:** ${oldMember.pending} → ${newMember.pending}`],
        });
      }
    });

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
        const actor = oldChannel && newChannel ? await actorFor(guild, AUDIT.MEMBER_MOVE, member.id) : [];
        await writeServerAudit({
          client,
          guild,
          eventType,
          title,
          userId: member.id,
          lines: [
            `**Member:** ${member} (${member.user.tag} • \`${member.id}\`)`,
            `**From:** ${oldChannel ? channelLabel(oldChannel) : 'Not connected'}`,
            `**To:** ${newChannel ? channelLabel(newChannel) : 'Disconnected'}`,
            ...actor,
          ],
        });
      }

      const before = voiceFlags(oldState);
      const after = voiceFlags(newState);
      const flagChanges = changedLines(Object.keys(before).map((key) => ({ label: key, before: before[key], after: after[key] })));
      if (flagChanges.length) {
        await writeServerAudit({
          client,
          guild,
          eventType: 'voice.state',
          title: 'Voice State Changed',
          userId: member.id,
          channelId: newChannel?.id || oldChannel?.id || null,
          lines: [`**Member:** ${member} (${member.user.tag} • \`${member.id}\`)`, ...flagChanges],
        });
      }
    });

    install(client, 'threadCreate', async (thread) => {
      const actor = await actorFor(thread.guild, AUDIT.THREAD_CREATE, thread.id);
      await writeServerAudit({
        client,
        guild: thread.guild,
        eventType: 'thread.create',
        title: 'Thread Created',
        channelId: thread.id,
        lines: [`**Thread:** ${channelLabel(thread)}`, `**Parent:** ${thread.parentId ? `<#${thread.parentId}>` : 'None'}`, ...actor],
      });
    });

    install(client, 'threadUpdate', async (oldThread, newThread) => {
      const changes = changedLines([
        { label: 'Name', before: oldThread.name, after: newThread.name },
        { label: 'Archived', before: oldThread.archived, after: newThread.archived },
        { label: 'Locked', before: oldThread.locked, after: newThread.locked },
        { label: 'Slowmode', before: oldThread.rateLimitPerUser, after: newThread.rateLimitPerUser },
        { label: 'Auto archive duration', before: oldThread.autoArchiveDuration, after: newThread.autoArchiveDuration },
      ]);
      if (!changes.length) return;
      const actor = await actorFor(newThread.guild, AUDIT.THREAD_UPDATE, newThread.id);
      await writeServerAudit({ client, guild: newThread.guild, eventType: 'thread.update', title: 'Thread Updated', channelId: newThread.id, lines: [`**Thread:** ${channelLabel(newThread)}`, ...changes, ...actor] });
    });

    install(client, 'threadDelete', async (thread) => {
      const actor = await actorFor(thread.guild, AUDIT.THREAD_DELETE, thread.id);
      await writeServerAudit({ client, guild: thread.guild, eventType: 'thread.delete', title: 'Thread Deleted', lines: [`**Thread:** #${thread.name} (\`${thread.id}\`)`, ...actor] });
    });

    const expressionHandler = (kind, action, auditType) => async (item) => {
      const actor = await actorFor(item.guild, auditType, item.id);
      await writeServerAudit({
        client,
        guild: item.guild,
        eventType: `${kind}.${action}`,
        title: `${kind === 'emoji' ? 'Emoji' : 'Sticker'} ${action[0].toUpperCase()}${action.slice(1)}d`,
        lines: [`**Name:** ${item.name || 'Unknown'}`, `**ID:** \`${item.id}\``, ...actor],
      });
    };
    install(client, 'emojiCreate', expressionHandler('emoji', 'create', AUDIT.EMOJI_CREATE));
    install(client, 'emojiUpdate', async (oldEmoji, newEmoji) => {
      const changes = changedLines([{ label: 'Name', before: oldEmoji.name, after: newEmoji.name }]);
      if (!changes.length) return;
      const actor = await actorFor(newEmoji.guild, AUDIT.EMOJI_UPDATE, newEmoji.id);
      await writeServerAudit({ client, guild: newEmoji.guild, eventType: 'emoji.update', title: 'Emoji Updated', lines: [`**Emoji:** ${newEmoji} (\`${newEmoji.id}\`)`, ...changes, ...actor] });
    });
    install(client, 'emojiDelete', expressionHandler('emoji', 'delete', AUDIT.EMOJI_DELETE));
    install(client, 'stickerCreate', expressionHandler('sticker', 'create', AUDIT.STICKER_CREATE));
    install(client, 'stickerUpdate', async (oldSticker, newSticker) => {
      const changes = changedLines([
        { label: 'Name', before: oldSticker.name, after: newSticker.name },
        { label: 'Description', before: oldSticker.description, after: newSticker.description },
        { label: 'Tags', before: oldSticker.tags, after: newSticker.tags },
      ]);
      if (!changes.length) return;
      const actor = await actorFor(newSticker.guild, AUDIT.STICKER_UPDATE, newSticker.id);
      await writeServerAudit({ client, guild: newSticker.guild, eventType: 'sticker.update', title: 'Sticker Updated', lines: [`**Sticker:** ${newSticker.name} (\`${newSticker.id}\`)`, ...changes, ...actor] });
    });
    install(client, 'stickerDelete', expressionHandler('sticker', 'delete', AUDIT.STICKER_DELETE));

    install(client, 'inviteCreate', async (invite) => {
      if (!invite.guild) return;
      const actor = await actorFor(invite.guild, AUDIT.INVITE_CREATE, invite.code);
      await writeServerAudit({
        client,
        guild: invite.guild,
        eventType: 'invite.create',
        title: 'Invite Created',
        channelId: invite.channelId,
        lines: [
          `**Code:** \`${invite.code}\``,
          `**Channel:** ${invite.channel ? channelLabel(invite.channel) : invite.channelId || 'Unknown'}`,
          `**Inviter:** ${invite.inviter ? `${invite.inviter} (${invite.inviter.tag})` : 'Unknown'}`,
          `**Max uses:** ${invite.maxUses || 'Unlimited'}`,
          `**Expires:** ${invite.maxAge ? `in ${invite.maxAge} seconds` : 'Never'}`,
          ...actor,
        ],
      });
    });

    install(client, 'inviteDelete', async (invite) => {
      if (!invite.guild) return;
      const actor = await actorFor(invite.guild, AUDIT.INVITE_DELETE, invite.code);
      await writeServerAudit({ client, guild: invite.guild, eventType: 'invite.delete', title: 'Invite Deleted', channelId: invite.channelId, lines: [`**Code:** \`${invite.code}\``, `**Channel:** ${invite.channelId ? `<#${invite.channelId}>` : 'Unknown'}`, ...actor] });
    });

    install(client, 'guildUpdate', async (oldGuild, newGuild) => {
      const changes = changedLines([
        { label: 'Name', before: oldGuild.name, after: newGuild.name },
        { label: 'Description', before: oldGuild.description, after: newGuild.description },
        { label: 'Verification level', before: oldGuild.verificationLevel, after: newGuild.verificationLevel },
        { label: 'Explicit content filter', before: oldGuild.explicitContentFilter, after: newGuild.explicitContentFilter },
        { label: 'Default notifications', before: oldGuild.defaultMessageNotifications, after: newGuild.defaultMessageNotifications },
        { label: 'AFK channel', before: oldGuild.afkChannelId, after: newGuild.afkChannelId },
        { label: 'System channel', before: oldGuild.systemChannelId, after: newGuild.systemChannelId },
        { label: 'Rules channel', before: oldGuild.rulesChannelId, after: newGuild.rulesChannelId },
        { label: 'Public updates channel', before: oldGuild.publicUpdatesChannelId, after: newGuild.publicUpdatesChannelId },
        { label: 'Icon', before: oldGuild.icon, after: newGuild.icon },
        { label: 'Banner', before: oldGuild.banner, after: newGuild.banner },
      ]);
      if (!changes.length) return;
      const actor = await actorFor(newGuild, AUDIT.GUILD_UPDATE, newGuild.id);
      await writeServerAudit({ client, guild: newGuild, eventType: 'guild.update', title: 'Server Settings Updated', lines: [...changes, ...actor] });
    });

    install(client, 'webhooksUpdate', async (channel) => {
      if (!channel.guild) return;
      const candidates = [AUDIT.WEBHOOK_CREATE, AUDIT.WEBHOOK_UPDATE, AUDIT.WEBHOOK_DELETE];
      let actor = [];
      for (const type of candidates) {
        actor = await actorFor(channel.guild, type, null);
        if (actor.length) break;
      }
      await writeServerAudit({ client, guild: channel.guild, eventType: 'webhook.update', title: 'Webhook Configuration Changed', channelId: channel.id, lines: [`**Channel:** ${channelLabel(channel)}`, ...actor] });
    });

    install(client, 'messageDeleteBulk', async (messages, channel) => {
      const guild = channel?.guild || messages.first()?.guild;
      if (!guild) return;
      await writeServerAudit({ client, guild, eventType: 'message.bulkdelete', title: 'Messages Bulk Deleted', channelId: channel?.id, lines: [`**Channel:** ${channel ? channelLabel(channel) : 'Unknown'}`, `**Messages deleted:** ${messages.size}`] });
    });

    install(client, 'channelPinsUpdate', async (channel, time) => {
      if (!channel.guild) return;
      await writeServerAudit({ client, guild: channel.guild, eventType: 'message.pins', title: 'Pinned Messages Changed', channelId: channel.id, lines: [`**Channel:** ${channelLabel(channel)}`, `**Updated:** <t:${Math.floor(new Date(time).getTime() / 1000)}:F>`] });
    });

    install(client, 'guildScheduledEventCreate', async (event) => {
      const actor = await actorFor(event.guild, AUDIT.SCHEDULED_EVENT_CREATE, event.id);
      await writeServerAudit({ client, guild: event.guild, eventType: 'scheduled.create', title: 'Scheduled Event Created', lines: [`**Event:** ${event.name} (\`${event.id}\`)`, `**Starts:** ${event.scheduledStartTimestamp ? `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>` : 'Unknown'}`, ...actor] });
    });
    install(client, 'guildScheduledEventUpdate', async (oldEvent, newEvent) => {
      const changes = changedLines([
        { label: 'Name', before: oldEvent.name, after: newEvent.name },
        { label: 'Description', before: oldEvent.description, after: newEvent.description },
        { label: 'Status', before: oldEvent.status, after: newEvent.status },
        { label: 'Start', before: oldEvent.scheduledStartTimestamp, after: newEvent.scheduledStartTimestamp },
        { label: 'End', before: oldEvent.scheduledEndTimestamp, after: newEvent.scheduledEndTimestamp },
      ]);
      if (!changes.length) return;
      const actor = await actorFor(newEvent.guild, AUDIT.SCHEDULED_EVENT_UPDATE, newEvent.id);
      await writeServerAudit({ client, guild: newEvent.guild, eventType: 'scheduled.update', title: 'Scheduled Event Updated', lines: [`**Event:** ${newEvent.name} (\`${newEvent.id}\`)`, ...changes, ...actor] });
    });
    install(client, 'guildScheduledEventDelete', async (event) => {
      const actor = await actorFor(event.guild, AUDIT.SCHEDULED_EVENT_DELETE, event.id);
      await writeServerAudit({ client, guild: event.guild, eventType: 'scheduled.delete', title: 'Scheduled Event Deleted', lines: [`**Event:** ${event.name} (\`${event.id}\`)`, ...actor] });
    });

    install(client, 'autoModerationRuleCreate', async (rule) => {
      const actor = await actorFor(rule.guild, AUDIT.AUTOMOD_RULE_CREATE, rule.id);
      await writeServerAudit({ client, guild: rule.guild, eventType: 'automod.create', title: 'AutoMod Rule Created', lines: [`**Rule:** ${rule.name} (\`${rule.id}\`)`, `**Enabled:** ${rule.enabled}`, ...actor] });
    });
    install(client, 'autoModerationRuleUpdate', async (oldRule, newRule) => {
      const changes = changedLines([{ label: 'Name', before: oldRule.name, after: newRule.name }, { label: 'Enabled', before: oldRule.enabled, after: newRule.enabled }, { label: 'Event type', before: oldRule.eventType, after: newRule.eventType }, { label: 'Trigger type', before: oldRule.triggerType, after: newRule.triggerType }]);
      if (!changes.length) return;
      const actor = await actorFor(newRule.guild, AUDIT.AUTOMOD_RULE_UPDATE, newRule.id);
      await writeServerAudit({ client, guild: newRule.guild, eventType: 'automod.update', title: 'AutoMod Rule Updated', lines: [`**Rule:** ${newRule.name} (\`${newRule.id}\`)`, ...changes, ...actor] });
    });
    install(client, 'autoModerationRuleDelete', async (rule) => {
      const actor = await actorFor(rule.guild, AUDIT.AUTOMOD_RULE_DELETE, rule.id);
      await writeServerAudit({ client, guild: rule.guild, eventType: 'automod.delete', title: 'AutoMod Rule Deleted', lines: [`**Rule:** ${rule.name} (\`${rule.id}\`)`, ...actor] });
    });
    install(client, 'autoModerationActionExecution', async (execution) => {
      await writeServerAudit({ client, guild: execution.guild, eventType: 'automod.action', title: 'AutoMod Action Executed', userId: execution.userId, channelId: execution.channelId, lines: [`**User:** <@${execution.userId}> (\`${execution.userId}\`)`, `**Channel:** ${execution.channelId ? `<#${execution.channelId}>` : 'Unknown'}`, `**Rule ID:** \`${execution.ruleId}\``, `**Action:** ${execution.action?.type ?? 'Unknown'}`, execution.matchedContent ? `**Matched content:** ${execution.matchedContent}` : '**Matched content:** Not provided by Discord'] });
    });

    install(client, 'userUpdate', async (oldUser, newUser) => {
      if (oldUser.bot || oldUser.avatar === newUser.avatar) return;
      for (const guild of client.guilds.cache.values()) {
        if (!guild.members.cache.has(newUser.id)) continue;
        await writeServerAudit({ client, guild, eventType: 'member.avatar', title: 'User Avatar Changed', userId: newUser.id, lines: [`**User:** ${newUser} (${newUser.tag} • \`${newUser.id}\`)`, `**Old avatar:** ${oldUser.displayAvatarURL({ size: 256 })}`, `**New avatar:** ${newUser.displayAvatarURL({ size: 256 })}`] });
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
      // Only the command name is logged. Arguments are intentionally excluded so
      // secrets such as `.api-key` values can never be copied into the audit log.
      await writeServerAudit({ client, guild: message.guild, eventType: 'command.prefix', title: 'Prefix Command Used', userId: message.author.id, channelId: message.channelId, lines: [`**User:** ${message.author} (${message.author.tag} • \`${message.author.id}\`)`, `**Command:** \`${prefix}${command}\``, `**Channel:** <#${message.channelId}>`] });
    });

    logger.info('Comprehensive one-channel server audit listeners installed.');
  },
};
