import { cleanDiscordId, resolveMember } from './commandUtils.js';
import { getLeoGuildConfig, isLeoBypassed, isProtectedUser } from './leoState.js';
import { handleLeoOwnerPrefixCommand } from './prefixOwnerCommands.js';

const COMMANDS = new Set(['blacklist']);

export function isLeoGlobalProtectionCommand(commandName) {
  return COMMANDS.has(String(commandName || '').toLowerCase());
}

export async function handleLeoGlobalProtectionCommand(message, commandName, args, client) {
  const name = String(commandName || '').toLowerCase();
  if (!COMMANDS.has(name)) return false;

  const target = await resolveMember(message.guild, args[0]);
  const userId = target?.id || cleanDiscordId(args[0]);
  if (userId && !(await isLeoBypassed(client, message.author.id))) {
    const protectedGuilds = [];
    for (const guild of client.guilds.cache.values()) {
      const leo = await getLeoGuildConfig(client, guild.id).catch(() => ({}));
      if (isProtectedUser(leo, userId)) protectedGuilds.push(guild.name);
    }
    if (protectedGuilds.length) {
      await message.reply(
        `That user is protected in ${protectedGuilds.length} server(s). ` +
        'Use the bypass system explicitly before applying a global blacklist.'
      ).catch(() => {});
      return true;
    }
  }

  await handleLeoOwnerPrefixCommand(message, 'blacklist', args, client);
  return true;
}
