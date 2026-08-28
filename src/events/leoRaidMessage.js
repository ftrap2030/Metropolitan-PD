import { Events, PermissionFlagsBits } from 'discord.js';
import { getLeoGuildConfig } from '../services/leo/leoState.js';
import { logger } from '../utils/logger.js';

const webhookWindows = new Map();
const pingWindows = new Map();
const WINDOW_MS = 5000;
const WEBHOOK_THRESHOLD = 5;
const PING_THRESHOLD = 3;

function record(map, key, windowMs = WINDOW_MS) {
  const now = Date.now();
  const values = (map.get(key) || []).filter((timestamp) => now - timestamp <= windowMs);
  values.push(now);
  map.set(key, values);
  return values.length;
}

async function sendAlert(message, leo, text) {
  const channelId = leo.alertChannelId;
  if (!channelId) return;
  const channel = message.guild.channels.cache.get(channelId)
    || await message.guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased?.()) {
    await channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
  }
}

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    try {
      if (!message.guild) return;
      const leo = await getLeoGuildConfig(message.client, message.guild.id);
      if (!leo.raidProtect) return;

      if (message.webhookId) {
        const count = record(webhookWindows, `${message.guild.id}:${message.webhookId}`);
        if (count >= WEBHOOK_THRESHOLD) {
          const webhook = await message.fetchWebhook().catch(() => null);
          if (webhook) {
            await webhook.delete('LEO raid protection: webhook spam threshold exceeded').catch(() => {});
          }
          await message.delete().catch(() => {});
          await sendAlert(message, leo, `LEO raid protection stopped webhook spam in #${message.channel?.name || 'unknown'} (webhook ${message.webhookId}).`);
          webhookWindows.delete(`${message.guild.id}:${message.webhookId}`);
        }
        return;
      }

      if (message.author?.bot) return;
      if (message.mentions?.everyone) {
        const member = message.member;
        if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return;
        const count = record(pingWindows, `${message.guild.id}:${message.author.id}`, 10000);
        if (count >= PING_THRESHOLD) {
          await message.delete().catch(() => {});
          if (member?.moderatable) {
            await member.timeout(10 * 60 * 1000, 'LEO raid protection: repeated mass pings').catch(() => {});
          }
          await sendAlert(message, leo, `LEO raid protection blocked repeated @everyone/@here pings from ${message.author.tag} (${message.author.id}).`);
          pingWindows.delete(`${message.guild.id}:${message.author.id}`);
        }
      }
    } catch (error) {
      logger.warn('LEO raid message protection error:', error);
    }
  },
};
