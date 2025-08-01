import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js"
import Users from "../../../models/user"
import type { Command } from "../../../types/commands"
import * as tokens from '../../../tokens/tokenFunctions'

const EPHEMERAL_FLAG = 1 << 6

declare global {
  namespace NodeJS {
    interface Global {
      accessTokens: Array<{ accountId: string; token: string }>;
      refreshTokens: Array<{ accountId: string; token: string }>;
    }
  }
}

const g = global as unknown as NodeJS.Global;

const BanCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user by their username")
    .addStringOption(option =>
      option
        .setName("username")
        .setDescription("The username of the player to ban")
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

      await Users.updateOne({ username }, { $set: { banned: true } }).exec()

      let refreshToken = g.refreshTokens.findIndex(i => i.accountId == userDoc.accountId)
      if (refreshToken != -1) g.refreshTokens.splice(refreshToken, 1)

      let accessToken = g.accessTokens.findIndex(i => i.accountId == userDoc.accountId)
      if (accessToken != -1) {
        global.accessTokens.splice(accessToken, 1)

        let xmppClient = global.Clients.find(client => client.accountId == userDoc.accountId)
        if (xmppClient) xmppClient.client.close()
      }

      if (accessToken != -1 || refreshToken != -1) tokens.UpdateTokens()

      await interaction.editReply({ content: `User **${username}** has been banned.` })
    } catch (error) {
      await interaction.editReply({ content: "An error occurred while processing the request." })
    }
  }
}

export default BanCommand
