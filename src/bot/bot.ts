import { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  REST, 
  Routes, 
  PermissionFlagsBits, 
  ChatInputCommandInteraction 
} from "discord.js"
import fs from "fs"
import path from "path"
import type { Command } from "../types/commands"
import { Log } from "../utils/logger"

const EPHEMERAL_FLAG = 1 << 6

const TOKEN = process.env.BOT_TOKEN!
const client = new Client({ intents: [GatewayIntentBits.Guilds] })

const commands = new Collection<string, Command>()

const userCommandsPath = path.join(__dirname, "commands", "user")
const userCommandFiles = fs.readdirSync(userCommandsPath).filter(f => f.endsWith(".ts") || f.endsWith(".js"))

const adminCommandsPath = path.join(__dirname, "commands", "admin")
const adminCommandFiles = fs.readdirSync(adminCommandsPath).filter(f => f.endsWith(".ts") || f.endsWith(".js"))

for (const file of userCommandFiles) {
  const filePath = path.join(userCommandsPath, file)
  const importedModule = await import(filePath)
  const importedCommand: Command = importedModule.default ?? importedModule
  if (!importedCommand?.data?.name) {
    Log.Warning(`Command file ${file} is missing a valid "data.name" property, skipping.`)
    continue
  }
  const command: Command = { ...importedCommand, adminOnly: false }
  commands.set(command.data.name, command)
}

for (const file of adminCommandFiles) {
  const filePath = path.join(adminCommandsPath, file)
  const importedModule = await import(filePath)
  const importedCommand: Command = importedModule.default ?? importedModule
  if (!importedCommand?.data?.name) {
    Log.Warning(`Admin command file ${file} is missing a valid "data.name" property, skipping.`)
    continue
  }
  const command: Command = { ...importedCommand, adminOnly: true }
  commands.set(command.data.name, command)
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN)
  const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON())

  try {
    await rest.put(Routes.applicationCommands(client.user!.id), {
      body: commandData,
    })
  } catch (error) {
    Log.Error("Error registering commands:", error)
  }
}

client.once("ready", () => {
  registerCommands()
  Log.Discord("Bot is up!")
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  const command = commands.get(interaction.commandName)
  if (!command) return

  if (command.adminOnly) {
    const member = interaction.member
    if (!member || !("permissions" in member)) {
      await interaction.reply({ content: "Cannot verify permissions.", flags: EPHEMERAL_FLAG })
      return
    }

    if (typeof member.permissions === 'string' || !member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "You do not have permission to use this command.", flags: EPHEMERAL_FLAG })
      return
    }
  }

  try {
    await command.execute(interaction as ChatInputCommandInteraction)
  } catch (error) {
    Log.Error("Command execution error:", error)
    if (!interaction.replied) {
      await interaction.reply({ content: "There was an error while executing this command.", flags: EPHEMERAL_FLAG })
    }
  }
})

client.login(TOKEN)
