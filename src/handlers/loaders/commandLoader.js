import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_COMMANDS = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;

function getSubcommandInfo(commandData) {
    const subcommands = [];
    if (commandData.options) {
        for (const option of commandData.options) {
            if (option.type === 1) {
                subcommands.push(option.name);
            } else if (option.type === 2 && option.options) {
                for (const subOption of option.options) {
                    if (subOption.type === 1) subcommands.push(`${option.name}/${subOption.name}`);
                }
            }
        }
    }
    return subcommands;
}

async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(directory, file.name);
        if (file.isDirectory()) {
            if (file.name === 'modules') continue;
            await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

export async function loadCommands(client) {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../../commands');
    const commandFiles = await getAllFiles(commandsPath);
    logger.info(`Found ${commandFiles.length} command files to load`);
    const uniqueCommandNames = new Set();

    for (const filePath of commandFiles) {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const commandDir = path.dirname(filePath);
            const category = path.basename(commandDir);
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default || commandModule;

            if (!command.data || !command.execute) {
                logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
                continue;
            }

            command.category = command.category || category;
            command.filePath = normalizedPath;
            const primaryCommandName = command.data.name;

            if (!uniqueCommandNames.has(primaryCommandName)) {
                uniqueCommandNames.add(primaryCommandName);
                client.commands.set(primaryCommandName, command);
            }

            const subcommands = getSubcommandInfo(command.data.toJSON());
            logger.info(`Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${command.category}${command.leoGuildOnly || command.guildOnly ? ', guild-only' : ''})`);
            if (subcommands.length > 0) logger.info(`  - Subcommands: ${subcommands.join(', ')}`);
        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }

    const uniqueCommands = new Set();
    for (const command of client.commands.values()) {
        if (command.data?.name) uniqueCommands.add(command.data.name);
    }
    logger.info(`Loaded ${uniqueCommands.size} commands`);
    return client.commands;
}

function collectCommandPayloads(client) {
    const commands = [];
    const guildCommands = [];
    let totalSubcommands = 0;
    let guildSubcommands = 0;
    const registeredNames = new Set();

    for (const command of client.commands.values()) {
        if (!command.data || typeof command.data.toJSON !== 'function') {
            logger.warn(`Command missing data or toJSON method: ${command}`);
            continue;
        }

        const commandName = command.data.name;
        if (registeredNames.has(commandName)) continue;
        registeredNames.add(commandName);
        const commandJson = command.data.toJSON();
        const subcommandCount = getSubcommandInfo(commandJson).length;

        if (command.leoGuildOnly === true || command.guildOnly === true) {
            guildCommands.push(commandJson);
            guildSubcommands += subcommandCount;
            logger.debug(`Queued guild-only command: ${commandName}`);
        } else {
            commands.push(commandJson);
            totalSubcommands += subcommandCount;
            logger.debug(`Queued global command: ${commandName}`);
        }
    }

    return { commands, totalSubcommands, guildCommands, guildSubcommands };
}

function validateCommands(commands) {
    const validationErrors = [];
    for (const cmd of commands) {
        if (cmd.name && cmd.name.length > 32) validationErrors.push(`Command ${cmd.name} has name longer than 32 chars`);
        if (cmd.description && cmd.description.length > 110) validationErrors.push(`Command ${cmd.name} has description longer than 110 chars`);
        if (!cmd.options) continue;

        for (const option of cmd.options) {
            if (option.name && option.name.length > 32) validationErrors.push(`Command ${cmd.name} option ${option.name} has name longer than 32 chars`);
            if (option.description && option.description.length > 110) validationErrors.push(`Command ${cmd.name} option ${option.name} has description longer than 110 chars`);
            if (option.choices) {
                for (const choice of option.choices) {
                    if (choice.name && choice.name.length > 110) validationErrors.push(`Command ${cmd.name} option ${option.name} choice name is too long`);
                    if (typeof choice.value === 'string' && choice.value.length > 100) validationErrors.push(`Command ${cmd.name} option ${option.name} choice value is too long`);
                }
            }
            if (!option.options) continue;
            for (const subOption of option.options) {
                if (subOption.name && subOption.name.length > 32) validationErrors.push(`Command ${cmd.name} subcommand option ${subOption.name} has name longer than 32 chars`);
                if (subOption.description && subOption.description.length > 110) validationErrors.push(`Command ${cmd.name} subcommand option ${subOption.name} has description longer than 110 chars`);
                if (subOption.choices) {
                    for (const choice of subOption.choices) {
                        if (choice.name && choice.name.length > 110) validationErrors.push(`Command ${cmd.name} choice name is too long`);
                        if (typeof choice.value === 'string' && choice.value.length > 100) validationErrors.push(`Command ${cmd.name} choice value is too long`);
                    }
                }
            }
        }
    }

    if (validationErrors.length > 0) {
        validationErrors.forEach((error) => logger.error(`  - ${error}`));
        throw new Error(`Command validation failed with ${validationErrors.length} errors`);
    }
}

function prepareCommandsForRegistration(commands) {
    if (commands.length >= COMMAND_COUNT_WARN_THRESHOLD) {
        logger.warn(`Global command count (${commands.length}) is near Discord's ${MAX_COMMANDS} limit`);
    }
    if (commands.length <= MAX_COMMANDS) return commands;
    logger.warn(`Global command count (${commands.length}) exceeds Discord limit (${MAX_COMMANDS}), truncating...`);
    return commands.slice(0, MAX_COMMANDS);
}

async function registerGlobalCommands(client, clientId, commands, totalSubcommands) {
    if (!clientId) throw new Error('CLIENT_ID is required for slash command registration');
    if (!client.rest) throw new Error('Discord REST client is not available for slash command registration');

    logger.info(`Preparing to register ${totalSubcommands + commands.length} command/subcommand entries globally`);
    validateCommands(commands);
    const commandsToRegister = prepareCommandsForRegistration(commands);

    if (botConfig.commands?.deleteCommands) {
        await client.rest.put(`/applications/${clientId}/commands`, { body: [] });
    }

    await client.rest.put(`/applications/${clientId}/commands`, { body: commandsToRegister });
    logger.info(`Successfully registered ${commandsToRegister.length} global commands`);
}

async function registerGuildCommands(client, clientId, guildId, commands, totalSubcommands) {
    if (!commands.length) return;
    if (!guildId) {
        logger.warn(`Skipping ${commands.length} LEO guild-only slash commands because GUILD_ID/TEST_GUILD_ID is not set`);
        return;
    }
    logger.info(`Registering ${commands.length} LEO guild-only commands (${totalSubcommands} subcommands) in guild ${guildId}`);
    validateCommands(commands);
    await client.rest.put(`/applications/${clientId}/guilds/${guildId}/commands`, { body: commands });
    logger.info(`Successfully registered ${commands.length} guild-only LEO commands in ${guildId}`);
}

export async function registerCommands(client, options = {}) {
    const { clientId = null, guildId = null } = options;
    try {
        const payloads = collectCommandPayloads(client);
        await registerGlobalCommands(client, clientId, payloads.commands, payloads.totalSubcommands);
        const targetGuildId = guildId || process.env.GUILD_ID || process.env.TEST_GUILD_ID || null;
        await registerGuildCommands(client, clientId, targetGuildId, payloads.guildCommands, payloads.guildSubcommands);
    } catch (error) {
        logger.error('Error registering commands:', error);
        throw error;
    }
}

export async function reloadCommand(client, commandName) {
    const command = client.commands.get(commandName);
    if (!command) return { success: false, message: `Command "${commandName}" not found` };

    try {
        const commandPath = path.resolve(command.filePath);
        const moduleUrl = pathToFileURL(commandPath);
        moduleUrl.searchParams.set('t', Date.now().toString());
        const newCommand = (await import(moduleUrl.href)).default;
        client.commands.set(commandName, newCommand);
        logger.info(`Reloaded command: ${commandName}`);
        return { success: true, message: `Successfully reloaded command "${commandName}"` };
    } catch (error) {
        logger.error(`Error reloading command "${commandName}":`, error);
        return { success: false, message: `Error reloading command: ${error.message}` };
    }
}
