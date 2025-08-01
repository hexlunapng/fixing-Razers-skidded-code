import { SlashCommandBuilder, ChatInputCommandInteraction, User } from "discord.js"
import path from "path"
import fs from "fs"
import destr from "destr"
import Users from "../../../models/user"
import Profiles from "../../../models/profiles"
import type { Command } from "../../../types/commands"

const EPHEMERAL_FLAG = 1 << 6

const FullLockerCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("fulllocker")
    .setDescription("Gives a user all cosmetics in the game.")
    .addUserOption(option =>
      option.setName("user").setDescription("The user you want to give full locker").setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG })

    const targetUser: User | null = interaction.options.getUser("user")
    if (!targetUser) {
      await interaction.editReply({ content: "Invalid user specified." })
      return
    }

    try {
      const userDoc = await Users.findOne({ discordId: targetUser.id }).lean()
      if (!userDoc) {
        await interaction.editReply({ content: "That user does not own an account." })
        return
      }

      const profileDoc = await Profiles.findOne({ accountId: userDoc.accountId }).lean()
      if (!profileDoc) {
        await interaction.editReply({ content: "That user does not have a profile?" })
        return
      }

      const allItemsRaw = fs.readFileSync(path.join(__dirname, "../../../../static/profiles/allathena.json"), "utf8")
      const allItems = destr(allItemsRaw) as any
      if (!allItems || !allItems.items) {
        await interaction.editReply({ content: "Failed to parse allathena.json" })
        return
      }

      await Profiles.findOneAndUpdate(
        { accountId: userDoc.accountId },
        { $set: { "profiles.athena.items": allItems.items } },
        { new: true }
      )

      await interaction.editReply({ content: `Successfully gave full locker to **<@${targetUser.id}>**` })
    } catch (error) {
      await interaction.editReply({ content: "An error occurred while processing the request." })
    }
  }
}

export default FullLockerCommand
