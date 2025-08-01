import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import User from "../../../models/user";
import Profiles from "../../../models/profiles";
import type { Command } from "../../../types/commands";

const EPHEMERAL_FLAG = 1 << 6;

const DetailsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("details")
    .setDescription("Gets your account details."),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG });

    const user = await User.findOne({ discordId: interaction.user.id }).lean();
    if (!user) {
      await interaction.editReply({
        content: "You do not have a registered account!",
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

    const vbucksProfile = await Profiles.findOne({ accountId: user.accountId }).lean();
    const commonCore = (vbucksProfile?.profiles as any)?.common_core;
    const currency = commonCore?.items?.["Currency:MtxPurchased"]?.quantity ?? 0;
    const onlineStatus = global.Clients?.some(i => i.accountId === user.accountId);

    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("Account details")
      .setThumbnail(interaction.user.displayAvatarURL({ extension: "png", size: 256 }))
      .addFields(
        { name: "Username:", value: user.username, inline: true },
        { name: "Email:", value: user.email, inline: true },
        { name: "Online:", value: onlineStatus ? "Yes" : "No", inline: true },
        { name: "Banned:", value: user.banned ? "Yes" : "No", inline: true },
        { name: "V-Bucks:", value: `${currency} V-Bucks`, inline: true },
        { name: "Account ID:", value: user.accountId }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      flags: EPHEMERAL_FLAG,
    });
  },
};

export default DetailsCommand;
