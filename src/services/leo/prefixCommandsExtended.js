import { isLeoGlobalProtectionCommand, handleLeoGlobalProtectionCommand } from './prefixGlobalProtectionCommands.js';
import { isLeoCompatibilityPrefixCommand, handleLeoCompatibilityPrefixCommand } from './prefixCompatibilityCommands.js';
import { isLeoOwnerPrefixCommand, handleLeoOwnerPrefixCommand } from './prefixOwnerCommands.js';
import { isLeoAdminPrefixCommand, handleLeoAdminPrefixCommand } from './prefixAdminCommands.js';

export function isLeoExtendedPrefixCommand(commandName) {
  return isLeoGlobalProtectionCommand(commandName)
    || isLeoCompatibilityPrefixCommand(commandName)
    || isLeoOwnerPrefixCommand(commandName)
    || isLeoAdminPrefixCommand(commandName);
}

export async function handleLeoExtendedPrefixCommand(message, commandName, args, client) {
  if (isLeoGlobalProtectionCommand(commandName)) {
    return handleLeoGlobalProtectionCommand(message, commandName, args, client);
  }
  if (isLeoCompatibilityPrefixCommand(commandName)) {
    return handleLeoCompatibilityPrefixCommand(message, commandName, args, client);
  }
  if (isLeoOwnerPrefixCommand(commandName)) {
    return handleLeoOwnerPrefixCommand(message, commandName, args, client);
  }
  if (isLeoAdminPrefixCommand(commandName)) {
    return handleLeoAdminPrefixCommand(message, commandName, args, client);
  }
  return false;
}
