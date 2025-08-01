import { SlashCommandBuilder, ChatInputCommandInteraction, User } from "discord.js";
import { v4 as uuidv4 } from "uuid";
import Users from "../../../models/user";
import Profiles from "../../../models/profiles";
import type { Command } from "../../../types/commands";

const EPHEMERAL_FLAG = 1 << 6;

const ChangeVBucksCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("changevbucks")
    .setDescription("Add or remove a user's V-Bucks (negative values remove).")
    .addUserOption(option =>
      option.setName("user").setDescription("The user whose V-Bucks you want to modify").setRequired(true))
    .addIntegerOption(option =>
      option.setName("vbucks").setDescription("Amount of V-Bucks to add or remove").setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG });

    const targetUser: User | null = interaction.options.getUser("user");
    if (!targetUser) {
      await interaction.editReply({ content: "Invalid user specified." });
      return;
    }

    const vbucks = interaction.options.getInteger("vbucks", true);
    if (vbucks === 0) {
      await interaction.editReply({ content: "Invalid V-Bucks amount specified." });
      return;
    }

    const userDoc = await Users.findOne({ discordId: targetUser.id }).lean();
    if (!userDoc) {
      await interaction.editReply({ content: "That user does not own an account." });
      return;
    }

    const filter = { accountId: userDoc.accountId };
    const updateCommonCore = { $inc: { "profiles.common_core.items.Currency:MtxPurchased.quantity": vbucks } };
    const options = { new: true };

    const updatedProfile = await Profiles.findOneAndUpdate(filter, updateCommonCore, options).lean();
    if (!updatedProfile) {
      await interaction.editReply({ content: "That user does not have a valid profile." });
      return;
    }

    const commonCore = (updatedProfile.profiles as any)["common_core"];
    const newQuantity = commonCore.items["Currency:MtxPurchased"].quantity;

    if (newQuantity < 0 || newQuantity >= 1_000_000) {
      await interaction.editReply({ content: "V-Bucks amount is out of valid range after the update." });
      return;
    }

    if (vbucks > 0) {
      const purchaseId = uuidv4();
      const lootList = [{
        itemType: "Currency:MtxGiveaway",
        itemGuid: "Currency:MtxGiveaway",
        quantity: vbucks
      }];

      commonCore.items[purchaseId] = {
        templateId: "GiftBox:GB_MakeGood",
        attributes: {
          fromAccountId: "[Administrator]",
          lootList: lootList,
          params: {
            userMessage: `Thanks for using Aegis Backend!`
          },
          giftedOn: new Date().toISOString()
        },
        quantity: 1
      };
    }

    commonCore.rvn += 1;
    commonCore.commandRevision += 1;
    commonCore.updated = new Date().toISOString();

    await Profiles.updateOne(filter, {
      $set: {
        "profiles.common_core": commonCore
      }
    });

    const action = vbucks > 0 ? "added" : "removed";
    await interaction.editReply({
      content: `Successfully **${action} ${Math.abs(vbucks)}** V-Bucks ${vbucks > 0 ? "to" : "from"} <@${targetUser.id}>.`
    });
  }
};

export default ChangeVBucksCommand;
