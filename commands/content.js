const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('content')
    .setDescription('📅 AI Content Planning Engine')
    // ---- post ----
    .addSubcommand(sub => sub
      .setName('post')
      .setDescription('Generate and post content (admin)')
      .addStringOption(opt => opt
        .setName('type')
        .setDescription('Type of content')
        .setRequired(true)
        .addChoices(
          { name: 'Education', value: 'education' },
          { name: 'Trivia', value: 'trivia' },
          { name: 'Quote', value: 'quote' },
          { name: 'Question', value: 'question' },
          { name: 'Market', value: 'market' },
          { name: 'VIP', value: 'vip' },
          { name: 'Premium', value: 'premium' }
        )
      )
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post to').setRequired(false))
    )
    // ---- calendar ----
    .addSubcommand(sub => sub
      .setName('calendar')
      .setDescription('Generate weekly content calendar (admin)')
    )
    // ---- status ----
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Show agent health status')
    )
    // ---- schedule GROUP ----
    .addSubcommandGroup(group => group
      .setName('schedule')
      .setDescription('Manage scheduled posts')
      .addSubcommand(sub => sub.setName('list').setDescription('List upcoming scheduled posts'))
      .addSubcommand(sub => sub
        .setName('add')
        .setDescription('Add a scheduled post')
        .addStringOption(opt => opt.setName('channel').setDescription('Channel key (announcements, general, vip, premium)').setRequired(true))
        .addStringOption(opt => opt.setName('content').setDescription('Content').setRequired(true))
        .addIntegerOption(opt => opt.setName('hours').setDescription('Hours from now to post').setRequired(true))
        .addStringOption(opt => opt.setName('type').setDescription('Type').setRequired(false))
      )
      .addSubcommand(sub => sub.setName('clear').setDescription('Clear all scheduled posts'))
    )
    // ---- library GROUP ----
    .addSubcommandGroup(group => group
      .setName('library')
      .setDescription('Manage content library')
      .addSubcommand(sub => sub
        .setName('add')
        .setDescription('Add content to library')
        .addStringOption(opt => opt.setName('title').setDescription('Title').setRequired(true))
        .addStringOption(opt => opt.setName('content').setDescription('Content').setRequired(true))
        .addStringOption(opt => opt.setName('tags').setDescription('Comma-separated tags').setRequired(false))
        .addBooleanOption(opt => opt.setName('evergreen').setDescription('Mark as evergreen').setRequired(false))
      )
      .addSubcommand(sub => sub.setName('list').setDescription('List library entries'))
      .addSubcommand(sub => sub
        .setName('search')
        .setDescription('Search library')
        .addStringOption(opt => opt.setName('query').setDescription('Search query').setRequired(true))
      )
    )
    // ---- trends ----
    .addSubcommand(sub => sub
      .setName('trends')
      .setDescription('Show recent detected trends')
    )
    // ---- analytics ----
    .addSubcommand(sub => sub
      .setName('analytics')
      .setDescription('Show content performance analytics')
    )
    // ---- campaign GROUP ----
    .addSubcommandGroup(group => group
      .setName('campaign')
      .setDescription('Manage campaigns')
      .addSubcommand(sub => sub
        .setName('create')
        .setDescription('Create a new campaign')
        .addStringOption(opt => opt.setName('name').setDescription('Campaign name').setRequired(true))
        .addStringOption(opt => opt
          .setName('type')
          .setDescription('Campaign type')
          .setRequired(true)
          .addChoices(
            { name: 'Token Launch', value: 'token_launch' },
            { name: 'Airdrop', value: 'airdrop' },
            { name: 'Governance', value: 'governance' },
            { name: 'Custom', value: 'default' }
          )
        )
      )
      .addSubcommand(sub => sub.setName('list').setDescription('List active campaigns'))
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};