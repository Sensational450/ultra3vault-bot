const fs = require('fs');
const path = require('path');

// Cache for command modules (load once)
const commands = new Map();

function loadCommands(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      loadCommands(filePath);
    } else if (file.endsWith('.js') && file !== 'register.js') {
      try {
        const cmd = require(filePath);
        if (cmd.data && cmd.data.name) {
          commands.set(cmd.data.name, cmd);
          console.log(`✅ Loaded command: ${cmd.data.name}`);
        }
      } catch (err) {
        console.error(`❌ Error loading command ${file}:`, err);
      }
    }
  }
}

// Load all commands at startup
loadCommands(path.join(__dirname, '../commands'));

module.exports = (client, orchestrator, options = {}) => {
  const { logger, buttonHandler } = options;

  client.on('interactionCreate', async (interaction) => {
    if (interaction.user?.bot) return;

    try {
      if (interaction.isCommand()) {
        const cmd = commands.get(interaction.commandName);
        if (cmd && typeof cmd.execute === 'function') {
          logger?.debug(`📡 Executing command: ${interaction.commandName}`);
          await cmd.execute(interaction);
        } else {
          logger?.warn(`⚠️ No execute function for command ${interaction.commandName}`);
          await interaction.reply({ content: '❌ Command not implemented.', ephemeral: true });
        }
      }
      else if (interaction.isButton() && buttonHandler) {
        logger?.debug(`🔘 Button interaction: ${interaction.customId}`);
        await buttonHandler.handle(interaction);
      }
      else if (interaction.isStringSelectMenu() && buttonHandler) {
        logger?.debug(`📋 Select menu: ${interaction.customId}`);
        await (buttonHandler.handleSelect?.(interaction) || orchestrator.onInteraction(interaction));
      }
      else if (interaction.isModalSubmit()) {
        logger?.debug(`🧾 Modal submit: ${interaction.customId}`);
        await orchestrator.onInteraction(interaction);
      }
      else {
        logger?.warn(`⚠️ Unhandled interaction type: ${interaction.type}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ This interaction type is not supported.', ephemeral: true });
        }
      }
    } catch (err) {
      logger?.error(`❌ Interaction error: ${err.message}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: '❌ An error occurred while processing your request.' });
      }
    }
  });
};