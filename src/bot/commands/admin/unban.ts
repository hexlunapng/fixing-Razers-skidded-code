import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js"
import Users from "../../../models/user"
import type { Command } from "../../../types/commands"

const EPHEMERAL_FLAG = 1 << 6

const UnbanCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by their username")
    .addStringOption(option =>
      option
        .setName("username")
        .setDescription("The username of the player to unban")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG })

    const username = interaction.options.getString("username", true)

    try {
      const userDoc = await Users.findOne({ username }).exec()
      if (!userDoc) {
        await interaction.editReply({ content: `No user found with username "${username}".` })
        return
      }

      await Users.updateOne({ username }, { $set: { banned: false } }).exec()

      await interaction.editReply({ content: `User **${username}** has been unbanned.` })
    } catch (error) {
      await interaction.editReply({ content: "An error occurred while processing the request." })
    }
  }
}

export default UnbanCommand
