const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('🧠 AI Assistant – ask, analyse, imagine, and more')
    // ask
    .addSubcommand(sub => sub
      .setName('ask')
      .setDescription('Ask a question to the AI')
      .addStringOption(opt => opt.setName('prompt').setDescription('Your question').setRequired(true))
      .addStringOption(opt => opt.setName('system').setDescription('Override system prompt (admin only)').setRequired(false))
    )
    // askimage
    .addSubcommand(sub => sub
      .setName('askimage')
      .setDescription('Analyse an image with AI')
      .addAttachmentOption(opt => opt.setName('image').setDescription('Image to analyse').setRequired(true))
      .addStringOption(opt => opt.setName('prompt').setDescription('Optional prompt').setRequired(false))
    )
    // reset
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Reset your conversation context')
    )
    // sentiment
    .addSubcommand(sub => sub
      .setName('sentiment')
      .setDescription('Analyse sentiment of text')
      .addStringOption(opt => opt.setName('text').setDescription('Text to analyse').setRequired(true))
    )
    // imagine
    .addSubcommand(sub => sub
      .setName('imagine')
      .setDescription('Generate an image with DALL‑E')
      .addStringOption(opt => opt.setName('prompt').setDescription('Image description').setRequired(true))
    )
    // stats
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('Show AI agent statistics')
    )
    // kb
    .addSubcommand(sub => sub
      .setName('kb')
      .setDescription('Knowledge Base management')
      .addSubcommand(opt => opt
        .setName('add')
        .setDescription('Add a document')
        .addStringOption(o => o.setName('content').setDescription('Document text').setRequired(true))
      )
      .addSubcommand(opt => opt
        .setName('query')
        .setDescription('Query the knowledge base')
        .addStringOption(o => o.setName('query').setDescription('Your question').setRequired(true))
      )
      .addSubcommand(opt => opt
        .setName('list')
        .setDescription('List all documents')
      )
    )
    // preferences
    .addSubcommand(sub => sub
      .setName('preferences')
      .setDescription('Manage your AI preferences')
      .addSubcommand(opt => opt
        .setName('watch')
        .setDescription('Manage watchlist')
        .addStringOption(o => o.setName('action').setDescription('Add or remove').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
        .addStringOption(o => o.setName('coin').setDescription('Coin symbol (e.g., BTC)').setRequired(true))
      )
      .addSubcommand(opt => opt
        .setName('setexpertise')
        .setDescription('Set your expertise level')
        .addStringOption(o => o.setName('level').setDescription('beginner, intermediate, advanced').setRequired(true))
      )
    )
    // config (admin)
    .addSubcommand(sub => sub
      .setName('config')
      .setDescription('Admin configuration')
      .addSubcommand(opt => opt
        .setName('enable')
        .setDescription('Enable AI features globally')
      )
      .addSubcommand(opt => opt
        .setName('disable')
        .setDescription('Disable AI features globally')
      )
      .addSubcommand(opt => opt
        .setName('channel')
        .setDescription('Whitelist/blacklist a channel')
        .addStringOption(o => o.setName('action').setDescription('Add or remove').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
        .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
      )
      .addSubcommand(opt => opt
        .setName('model')
        .setDescription('Set AI model')
        .addStringOption(o => o.setName('model').setDescription('Model name (e.g., gpt-3.5-turbo)').setRequired(true))
      )
      .addSubcommand(opt => opt
        .setName('system')
        .setDescription('Set system prompt')
        .addStringOption(o => o.setName('prompt').setDescription('System prompt').setRequired(true))
      )
      .addSubcommand(opt => opt
        .setName('block')
        .setDescription('Block a user from using AI')
        .addUserOption(o => o.setName('user').setDescription('User to block').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
      )
      .addSubcommand(opt => opt
        .setName('unblock')
        .setDescription('Unblock a user')
        .addUserOption(o => o.setName('user').setDescription('User to unblock').setRequired(true))
      )
      .addSubcommand(opt => opt
        .setName('setquota')
        .setDescription('Set monthly token quota per user')
        .addIntegerOption(o => o.setName('quota').setDescription('Token limit').setRequired(true))
      )
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};