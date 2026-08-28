import { isLeoOwnerPrefixCommand, handleLeoOwnerPrefixCommand } from './prefixOwnerCommands.js';
import { isLeoAdminPrefixCommand, handleLeoAdminPrefixCommand } from './prefixAdminCommands.js';

export function isLeoExtendedPrefixCommand(commandName) {
  return isLeoOwnerPrefixCommand(commandName) || isLeoAdminPrefixCommand(commandName);
}

export async function handleLeoExtendedPrefixCommand(message, commandName, args, client) {
  if (isLeoOwnerPrefixCommand(commandName)) {
    return handleLeoOwnerPrefixCommand(message, commandName, args, client);
  }
  if (isLeoAdminPrefixCommand(commandName)) {
    return handleLeoAdminPrefixCommand(message, commandName, args, client);
  }
  return false;
}
