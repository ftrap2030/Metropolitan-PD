import { getDmLogUsers } from './leoState.js';

export async function sendLeoSecurityAlert(client, guild, leo, text, options = {}) {
  const roleIds = (leo?.alertRoleIds || []).slice(0, 3);
  const userIds = (leo?.alertUserIds || []).slice(0, 2);
  const mentions = [
    ...roleIds.map((id) => `<@&${id}>`),
    ...userIds.map((id) => `<@${id}>`),
  ];

  if (leo?.alertChannelId) {
    const channel = guild.channels.cache.get(leo.alertChannelId)
      || await guild.channels.fetch(leo.alertChannelId).catch(() => null);
    if (channel?.isTextBased?.()) {
      await channel.send({
        content: `${mentions.length ? `${mentions.join(' ')}\n` : ''}${text}`,
        allowedMentions: { roles: roleIds, users: userIds, parse: [] },
      }).catch(() => {});
    }
  }

  if (options.dmSecurityUsers) {
    const recipients = await getDmLogUsers(client).catch(() => ({}));
    for (const userId of Object.keys(recipients || {})) {
      const user = await client.users.fetch(userId).catch(() => null);
      if (user) await user.send(`Security alert from **${guild.name}** (${guild.id}):\n${text}`).catch(() => {});
    }
  }
}
