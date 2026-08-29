import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getLeoGuildConfig, isLeoBypassed, isProtectedUser } from '../../services/leo/leoState.js';
import { createModerationAppeal } from '../../services/leo/moderationAppealService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the server")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to ban")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the ban"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const user = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason") || "No reason provided";

        if (!user) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to ban.',
                { subtype: 'invalid_user' },
            );
        }

        if (user.id === interaction.user.id) {
            throw new TitanBotError(
                'Cannot ban self',
                ErrorTypes.VALIDATION,
                'You cannot ban yourself.',
            );
        }
        if (user.id === client.user.id) {
            throw new TitanBotError(
                'Cannot ban bot',
                ErrorTypes.VALIDATION,
                'You cannot ban the bot.',
            );
        }

        const explicitlyBypassed = await isLeoBypassed(client, interaction.user.id);
        if (!explicitlyBypassed) {
            const leo = await getLeoGuildConfig(client, interaction.guildId);
            if (isProtectedUser(leo, user.id)) {
                throw new TitanBotError(
                    'Protected user ban blocked',
                    ErrorTypes.PERMISSION,
                    'This user is protected from LEO ban actions. Use the bypass system explicitly before taking this action.',
                );
            }
        }

        const result = await ModerationService.banUser({
            guild: interaction.guild,
            user,
            moderator: interaction.member,
            reason,
        });

        try {
            const appeal = await createModerationAppeal(client, interaction.guildId, {
                kind: 'ban',
                targetId: user.id,
                staffId: interaction.user.id,
                reason,
                moderationCaseId: result.caseId || null,
            });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`leo_mod_appeal:${interaction.guildId}:${appeal.id}`)
                    .setLabel('Appeal Ban')
                    .setStyle(ButtonStyle.Secondary),
            );
            await user.send({
                embeds: [createEmbed({
                    title: `Ban Appeal — Case #${appeal.id}`,
                    description: `You were banned from **${interaction.guild.name}**.\n\n**Reason:** ${reason}\n\nUse the button below if you want staff to review this action.`,
                    color: 'warning',
                })],
                components: [row],
            }).catch(() => {});
        } catch {
            // A failed appeal DM/storage write must not undo a successful moderation action.
        }

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `🚫 **Banned** ${user.tag}`,
                    `**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
                ),
            ],
        });
    },
};
