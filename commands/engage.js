const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('engage')
    .setDescription('🎯 Engagement activities (polls, quizzes, predictions, etc.)')
    // ---- poll (admin) ----
    .addSubcommand(sub => sub
      .setName('poll')
      .setDescription('Create a poll (admin)')
      .addStringOption(opt => opt.setName('question').setDescription('Poll question').setRequired(true))
      .addStringOption(opt => opt.setName('options').setDescription('Comma-separated options').setRequired(true))
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post to').setRequired(false))
    )
    // ---- quiz (admin) ----
    .addSubcommand(sub => sub
      .setName('quiz')
      .setDescription('Create a quiz (admin)')
      .addStringOption(opt => opt.setName('question').setDescription('Quiz question').setRequired(true))
      .addStringOption(opt => opt.setName('options').setDescription('Comma-separated options').setRequired(true))
      .addIntegerOption(opt => opt.setName('correct').setDescription('Correct option index (0-based)').setRequired(true))
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post to').setRequired(false))
    )
    // ---- debate (admin) ----
    .addSubcommand(sub => sub
      .setName('debate')
      .setDescription('Start a debate (admin)')
      .addStringOption(opt => opt.setName('title').setDescription('Debate title').setRequired(true))
      .addStringOption(opt => opt.setName('description').setDescription('Debate description').setRequired(true))
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post to').setRequired(false))
    )
    // ---- predict ----
    .addSubcommand(sub => sub
      .setName('predict')
      .setDescription('Make a price prediction')
      .addStringOption(opt => opt.setName('asset').setDescription('Asset symbol (e.g., BTC)').setRequired(true))
      .addNumberOption(opt => opt.setName('price').setDescription('Target price in USD').setRequired(true))
    )
    // ---- portfolio ----
    .addSubcommandGroup(group => group
      .setName('portfolio')
      .setDescription('Fantasy portfolio management')
      .addSubcommand(sub => sub.setName('view').setDescription('View your portfolio'))
      .addSubcommand(sub => sub
        .setName('buy')
        .setDescription('Buy shares of an asset')
        .addStringOption(opt => opt.setName('asset').setDescription('Asset symbol').setRequired(true))
        .addNumberOption(opt => opt.setName('shares').setDescription('Number of shares').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('sell')
        .setDescription('Sell shares of an asset')
        .addStringOption(opt => opt.setName('asset').setDescription('Asset symbol').setRequired(true))
        .addNumberOption(opt => opt.setName('shares').setDescription('Number of shares').setRequired(true))
      )
    )
    // ---- leaderboard ----
    .addSubcommand(sub => sub
      .setName('leaderboard')
      .setDescription('Show prediction leaderboard')
    )
    // ---- health ----
    .addSubcommand(sub => sub
      .setName('health')
      .setDescription('Show agent health status')
    )
    // ---- config (admin) ----
    .addSubcommand(sub => sub
      .setName('config')
      .setDescription('Enable/disable features (admin)')
      .addStringOption(opt => opt
        .setName('feature')
        .setDescription('Feature to toggle')
        .setRequired(true)
        .addChoices(
          { name: 'Polls', value: 'enablePolls' },
          { name: 'Quizzes', value: 'enableQuizzes' },
          { name: 'Debates', value: 'enableDebates' },
          { name: 'Trivia', value: 'enableTrivia' },
          { name: 'Predictions', value: 'enablePredictions' },
          { name: 'Portfolio', value: 'enablePortfolio' },
          { name: 'Mentor', value: 'enableMentor' }
        )
      )
      .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable or disable').setRequired(true))
    )
    // ---- mentor (admin) ----
    .addSubcommandGroup(group => group
      .setName('mentor')
      .setDescription('Manage mentor lessons (admin)')
      .addSubcommand(sub => sub
        .setName('set')
        .setDescription('Set a custom mentor lesson')
        .addIntegerOption(opt => opt.setName('index').setDescription('Lesson index (0-based)').setRequired(true))
        .addStringOption(opt => opt.setName('text').setDescription('Lesson text').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('list')
        .setDescription('List custom mentor lessons')
      )
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};