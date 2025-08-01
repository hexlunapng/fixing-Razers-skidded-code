import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { registerUser } from "../../../utils/functions";
import type { Command } from "../../../types/commands";

const EPHEMERAL_FLAG = 1 << 6;

const RegisterCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register a new user")
    .addStringOption(option =>
      option.setName("username").setDescription("Your username").setRequired(true))
    .addStringOption(option =>
      option.setName("email").setDescription("Your email").setRequired(true))
    .addStringOption(option =>
      option.setName("password").setDescription("Your password").setRequired(true)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const discordId = interaction.user.id;
      const username = interaction.options.getString("username", true);
      const email = interaction.options.getString("email", true);
      const plainPassword = interaction.options.getString("password", true);

      await registerUser(discordId, username, email, plainPassword, false);

      await interaction.reply({
        content: `Successfully registered user **${username}**!`,
        flags: EPHEMERAL_FLAG
      });
    } catch (error: any) {
      await interaction.reply({
        content: `Registration failed: ${error.message}`,
        flags: EPHEMERAL_FLAG
      });
    }
  }
};

export default RegisterCommand;
