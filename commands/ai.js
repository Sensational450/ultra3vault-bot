const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('🧠 AI Assistant – ask, analyse, imagine, and more')
    // ---- ask ----
    .addSubcommand(sub => sub
      .setName('ask')
      .setDescription('Ask a question to the AI')
      .addStringOption(opt => opt.setName('prompt').setDescription('Your question').setRequired(true))
      .addStringOption(opt => opt.setName('system').setDescription('Override system prompt').setRequired(false))
    )
    // ---- askimage ----
    .addSubcommand(sub => sub
      .setName('askimage')
      .setDescription('Analyse an image with AI')
      .addAttachmentOption(opt => opt.setName('image').setDescription('Image to analyse').setRequired(true))
      .addStringOption(opt => opt.setName('prompt').setDescription('Optional prompt').setRequired(false))
    )
    // ---- reset ----
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Reset your conversation context')
    )
    // ---- sentiment ----
    .addSubcommand(sub => sub
      .setName('sentiment')
      .setDescription('Analyse sentiment of text')
      .addStringOption(opt => opt.setName('text').setDescription('Text to analyse').setRequired(true))
    )
    // ---- imagine ----
    .addSubcommand(sub => sub
      .setName('imagine')
      .setDescription('Generate an image with DALL‑E')
      .addStringOption(opt => opt.setName('prompt').setDescription('Image description').setRequired(true))
    )
    // ---- stats ----
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('Show AI agent statistics')
    )
    // ---- kb GROUP ----
    .addSubcommandGroup(group => group
      .setName('kb')
      .setDescription('Knowledge Base management')
      .addSubcommand(sub => sub
        .setName('add')
        .setDescription('Add a document')
        .addStringOption(opt => opt.setName('content').setDescription('Document text').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('query')
        .setDescription('Query the knowledge base')
        .addStringOption(opt => opt.setName('query').setDescription('Your question').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('list')
        .setDescription('List all documents')
      )
    )
    // ---- preferences GROUP ----
    .addSubcommandGroup(group => group
      .setName('preferences')
      .setDescription('Manage your AI preferences')
      .addSubcommand(sub => sub
        .setName('watch')
        .setDescription('Manage watchlist')
        .addStringOption(opt => opt
          .setName('action')
          .setDescription('Add or remove')
          .setRequired(true)
          .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })
        )
        .addStringOption(opt => opt.setName('coin').setDescription('Coin symbol (e.g., BTC)').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('setexpertise')
        .setDescription('Set your expertise level')
        .addStringOption(opt => opt.setName('level').setDescription('beginner, intermediate, advanced').setRequired(true))
      )
    )
    // ---- config GROUP (admin) ----
    .addSubcommandGroup(group => group
      .setName('config')
      .setDescription('Admin configuration')
      .addSubcommand(sub => sub.setName('enable').setDescription('Enable AI features globally'))
      .addSubcommand(sub => sub.setName('disable').setDescription('Disable AI features globally'))
      .addSubcommand(sub => sub
        .setName('channel')
        .setDescription('Whitelist/blacklist a channel')
        .addStringOption(opt => opt
          .setName('action')
          .setDescription('Add or remove')
          .setRequired(true)
          .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })
        )
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('model')
        .setDescription('Set AI model')
        .addStringOption(opt => opt.setName('model').setDescription('Model name').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('system')
        .setDescription('Set system prompt')
        .addStringOption(opt => opt.setName('prompt').setDescription('System prompt').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('block')
        .setDescription('Block a user from using AI')
        .addUserOption(opt => opt.setName('user').setDescription('User to block').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
      )
      .addSubcommand(sub => sub
        .setName('unblock')
        .setDescription('Unblock a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to unblock').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('setquota')
        .setDescription('Set monthly token quota per user')
        .addIntegerOption(opt => opt.setName('quota').setDescription('Token limit').setRequired(true))
      )
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};