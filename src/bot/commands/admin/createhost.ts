import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js"
import { registerUser } from "../../../utils/functions"
import Users from "../../../models/user"
import type { Command } from "../../../types/commands"
import { Log } from "../../../utils/logger"
import { trusted } from "mongoose"

const EPHEMERAL_FLAG = 1 << 6

const CreateHostAccountCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("createhost")
    .setDescription("Creates a host account."),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG })

    try {
      const serverOwnerId = interaction.guild?.ownerId
      if (interaction.user.id !== serverOwnerId) {
        await interaction.editReply({ content: "Only the server owner can execute this command.", flags: EPHEMERAL_FLAG })
        return
      }

      const existingHostAccount = await Users.findOne({ email: "hostaccount@aegis.com" })
      if (existingHostAccount) {
        await interaction.editReply({ content: "A host account has already been created.", flags: EPHEMERAL_FLAG })
        return
      }

      const username = "aegishostaccount"
      const email = "hostaccount@aegis.com"
      const password = generateRandomPassword(12)

      const resp = await registerUser(null, username, email, password, true)

      const embed = new EmbedBuilder()
        .setColor(0x56ff00)
        .addFields(
          { name: "Message", value: 'Successfully created a host account' },
          { name: "Username", value: `\`\`\`${username}\`\`\`` },
          { name: "Email", value: `\`\`\`${email}\`\`\`` },
          { name: "Password", value: `\`\`\`${password}\`\`\`` },
        )
        .setTimestamp()

      if (resp) {
        await interaction.editReply({ embeds: [embed], flags: EPHEMERAL_FLAG })
      } else {
        await interaction.editReply({
            content: "Failed to create a host account.",
            flags: EPHEMERAL_FLAG,
        })
      }
    } catch (error) {
      Log.Error(error)
      await interaction.editReply({
        content: "An error occurred while creating the host account.",
        flags: EPHEMERAL_FLAG,
      })
    }
  },
}

function generateRandomPassword(length: number): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+<>?"
  let password = ""
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length)
    password += charset[randomIndex]
  }
  return password
}

export default CreateHostAccountCommand
