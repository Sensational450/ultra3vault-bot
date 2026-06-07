/**
 * 📜 Command Register v5.0
 * - Recursively scans the `commands/` folder for command files
 * - Loads each command's `data` property (name, description, options)
 * - Registers slash commands with Discord (global or guild-specific)
 * - Supports command deletion (optional)
 * - Clears require cache to always use latest command definitions
 */
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 🔧 Configuration – read from environment or hardcoded
const CLIENT_ID = process.env.CLIENT_ID;
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID || null; // Set to a guild ID for instant updates (dev), null for global

// 📂 Recursively find all .js files in a directory
function getAllCommandFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllCommandFiles(filePath, fileList);
    } else if (file.endsWith('.js') && file !== 'register.js') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// 📦 Load command data from each file (with cache clearing)
async function loadCommands(commandsDir) {
  const commandFiles = getAllCommandFiles(commandsDir);
  const commands = [];
  for (const file of commandFiles) {
    try {
      // Clear require cache to always get the latest version of the command file
      delete require.cache[require.resolve(file)];
      const command = require(file);
      if (command.data && command.data.name && command.data.description) {
        commands.push(command.data);
        console.log(`✅ Loaded command: ${command.data.name} (${path.basename(file)})`);
      } else {
        console.warn(`⚠️ Skipping ${path.basename(file)}: missing data.name or data.description`);
      }
    } catch (err) {
      console.error(`❌ Error loading command from ${path.basename(file)}:`, err);
    }
  }
  return commands;
}

// 🧹 Optional: Delete all existing commands (careful!)
async function deleteAllCommands(rest, clientId, guildId = null) {
  try {
    if (guildId) {
      const commands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
      for (const cmd of commands) {
        await rest.delete(Routes.applicationGuildCommand(clientId, guildId, cmd.id));
        console.log(`🗑️ Deleted guild command: ${cmd.name}`);
      }
    } else {
      const commands = await rest.get(Routes.applicationCommands(clientId));
      for (const cmd of commands) {
        await rest.delete(Routes.applicationCommand(clientId, cmd.id));
        console.log(`🗑️ Deleted global command: ${cmd.name}`);
      }
    }
  } catch (err) {
    console.error('❌ Error deleting commands:', err);
  }
}

// 🚀 Register commands
async function registerCommands(deleteExisting = false) {
  if (!TOKEN || !CLIENT_ID) {
    throw new Error('❌ Missing TOKEN or CLIENT_ID in environment variables');
  }

  const commandsDir = path.join(__dirname);
  const commands = await loadCommands(commandsDir);
  if (commands.length === 0) {
    console.warn('⚠️ No commands found to register.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    if (deleteExisting) {
      await deleteAllCommands(rest, CLIENT_ID, GUILD_ID);
    }

    let result;
    if (GUILD_ID) {
      // Guild-specific registration (instant update)
      result = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`✅ Registered ${result.length} slash commands for guild ${GUILD_ID}`);
    } else {
      // Global registration (may take up to 1 hour to propagate)
      result = await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(`✅ Registered ${result.length} global slash commands`);
    }
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
}

// 🏃 Run if called directly (node commands/register.js)
if (require.main === module) {
  const deleteFlag = process.argv.includes('--delete');
  registerCommands(deleteFlag).catch(console.error);
}

module.exports = registerCommands;