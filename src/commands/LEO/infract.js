import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLeoGuildConfig } from '../../services/leo/leoState.js';
import { getSlashLeoAccessLevel, replySuccess } from '../../services/leo/slashUtils.js';
import { levelAtLeast } from '../../services/leo/commandUtils.js';
import { createHrCase, getInfractionRoleId, INFRACTION_TYPES } from '../../services/leo/hrService.js';

export default {
  leoGuildOnly: true,
  category: 'leo',
  data: new SlashCommandBuilder()
    .setName('infract')
    .setDescription('Log an HR infraction, DM the target with an appeal button, and post it')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member receiving the infraction').setRequired(true))
    .addStringOption((o) => o.setName('type').setDescription('Infraction type').setRequired(true).addChoices(
      { name: 'Warning 1', value: 'W1' }, { name: 'Warning 2', value: 'W2' },
      { name: 'Strike 1', value: 'S1' }, { name: 'Strike 2', value: 'S2' },
      { name: 'Suspension', value: 'SUSPENSION' }, { name: 'Termination', value: 'TERMINATION' },
      { name: 'Retirement', value: 'RETIREMENT' }, { name: 'Activity Watch', value: 'ACTIVITY_WATCH' },
    ))
    .addStringOption((o) => o.setName('reason').setDescription('Infraction reason').setRequired(true).setMaxLength(1000))
    .addStringOption((o) => o.setName('notes').setDescription('Internal staff note').setMaxLength(1000)),
  async execute(interaction, config, client) {
    const leo = await getLeoGuildConfig(client, interaction.guildId);
    if (leo.hrSystemEnabled === false) return interaction.reply({ content: 'The HR system is disabled in this server.', ephemeral: true });
    const level = await getSlashLeoAccessLevel(interaction, client, leo);
    const roleAccess = leo.infractionRoleId && interaction.member.roles.cache.has(leo.infractionRoleId);
    if (!levelAtLeast(level, 'admin') && !roleAccess) return interaction.reply({ content: 'You do not have access to /infract.', ephemeral: true });

    const target = interaction.options.getMember('user');
    const type = interaction.options.getString('type', true);
    const reason = interaction.options.getString('reason', true);
    const notes = interaction.options.getString('notes');
    if (!target) return interaction.reply({ content: 'That member is not in this server.', ephemeral: true });
    if (interaction.guild.ownerId !== interaction.user.id && target.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ content: 'You cannot infract a member at or above your hierarchy.', ephemeral: true });
    }

    const roleId = getInfractionRoleId(leo, type);
    if (roleId) {
      const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (role?.editable && !target.roles.cache.has(role.id)) await target.roles.add(role, `HR infraction by ${interaction.user.tag}`);
    }

    const record = await createHrCase(client, interaction.guildId, {
      kind: 'infraction', targetId: target.id, staffId: interaction.user.id,
      type, reason, appliedRoleId: roleId || null,
      notes: notes ? [{ text: notes, authorId: interaction.user.id, createdAt: new Date().toISOString() }] : [],
    });

    const label = INFRACTION_TYPES[type]?.label || type;
    const embed = createEmbed({
      title: 'HR Infraction',
      description: `${target} received **${label}**.\n\n**Reason:** ${reason}\n**Case:** #${record.id}`,
      color: 'warning', image: leo.banners?.infraction || null,
    });
    const appealRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`leo_hr_appeal:${interaction.guildId}:${record.id}`).setLabel('Appeal').setStyle(ButtonStyle.Secondary),
    );
    await target.send({ embeds: [embed], components: [appealRow] }).catch(() => {});

    const channelId = type === 'RETIREMENT' ? leo.retirementChannelId : leo.infractionChannelId;
    const channel = channelId ? interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null) : interaction.channel;
    if (channel?.isTextBased?.()) await channel.send({ embeds: [embed] });
    await replySuccess(interaction, 'Infraction Logged', `${target} received **${label}**. Case #${record.id} was created.`);
  },
};
