import { AttachmentBuilder } from 'discord.js';
import { getGuildConfig } from '../config/guildConfig.js';
import { getLeoGuildConfig } from './leoState.js';

function sanitize(value) {
  return String(value || '').replace(/\r/g, '').trim();
}

export async function buildTicketTranscript(channel, limit = 100) {
  const collection = await channel.messages.fetch({ limit: Math.min(100, Math.max(1, limit)) }).catch(() => null);
  if (!collection) return null;
  const messages = [...collection.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = messages.map((message) => {
    const stamp = new Date(message.createdTimestamp).toISOString();
    const author = message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown';
    const content = sanitize(message.content) || (message.embeds?.length ? '[Embed]' : '[No text]');
    const attachments = [...message.attachments.values()].map((attachment) => attachment.url);
    return `[${stamp}] ${author}: ${content}${attachments.length ? `\n  Attachments: ${attachments.join(', ')}` : ''}`;
  });
  return [
    `Ticket transcript: #${channel.name} (${channel.id})`,
    `Server: ${channel.guild.name} (${channel.guild.id})`,
    `Generated: ${new Date().toISOString()}`,
    '',
    ...lines,
  ].join('\n');
}

export async function postTicketTranscript(client, channel, closer = null, reason = null) {
  const [config, leo] = await Promise.all([
    getGuildConfig(client, channel.guild.id),
    getLeoGuildConfig(client, channel.guild.id),
  ]);
  const transcriptChannelId = config?.ticketLogging?.transcriptChannelId || leo.transcriptChannelId || null;
  if (!transcriptChannelId) return { posted: false, reason: 'not_configured' };

  const destination = channel.guild.channels.cache.get(transcriptChannelId)
    || await channel.guild.channels.fetch(transcriptChannelId).catch(() => null);
  if (!destination?.isTextBased?.()) return { posted: false, reason: 'channel_missing' };

  const text = await buildTicketTranscript(channel);
  if (!text) return { posted: false, reason: 'fetch_failed' };
  const attachment = new AttachmentBuilder(Buffer.from(text, 'utf8'), {
    name: `transcript-${channel.name}-${channel.id}.txt`.replace(/[^a-zA-Z0-9._-]/g, '-'),
  });
  await destination.send({
    content: `Closed ticket transcript for **#${channel.name}**${closer ? ` — closed by ${closer}` : ''}${reason ? `\nReason: ${reason}` : ''}`,
    files: [attachment],
    allowedMentions: { parse: [] },
  });
  return { posted: true };
}
