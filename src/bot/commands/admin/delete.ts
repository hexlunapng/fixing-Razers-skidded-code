import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js"
import Users from "../../../models/user"
import type { Command } from "../../../types/commands"
import * as functions from "../../../utils/functions"

const EPHEMERAL_FLAG = 1 << 6

const DeleteUserCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Deletes a user from the backend.")
    .addStringOption(option =>
      option.setName("username")
        .setDescription("The username of the user to delete")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG })

    const username = interaction.options.getString("username", true)

    try {
      const userDoc = await Users.findOne({ username }).lean()
      if (!userDoc) {
        await interaction.editReply({ content: `User with username "${username}" not found.` })
        return
      }

      await functions.deleteUser(userDoc.accountId)

      await interaction.editReply({ content: `Successfully deleted user **${username}**.` })
    } catch (error) {
      await interaction.editReply({ content: "An error occurred while deleting the user." })
    }
  }
}

export default DeleteUserCommand