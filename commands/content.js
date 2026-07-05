const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('content')
    .setDescription('📅 AI Content Planning Engine')
    // post
    .addSubcommand(sub => sub
      .setName('post')
      .setDescription('Generate and post content (admin)')
      .addStringOption(opt => opt.setName('type').setDescription('Type').setRequired(true).addChoices(...))
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(false))
    )
    // calendar
    .addSubcommand(sub => sub
      .setName('calendar')
      .setDescription('Generate weekly content calendar (admin)')
    )
    // status
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Show agent health status')
    )
    // schedule
    .addSubcommand(sub => sub
      .setName('schedule')
      .setDescription('Manage scheduled posts')
      .addSubcommand(opt => opt.setName('list').setDescription('List upcoming scheduled posts'))
      .addSubcommand(opt => opt
        .setName('add')
        .setDescription('Add a scheduled post')
        .addStringOption(o => o.setName('channel').setDescription('Channel key (announcements, general, vip, premium)').setRequired(true))
        .addStringOption(o => o.setName('content').setDescription('Content').setRequired(true))
        .addIntegerOption(o => o.setName('hours').setDescription('Hours from now to post').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Type (optional)').setRequired(false))
      )
      .addSubcommand(opt => opt
        .setName('clear')
        .setDescription('Clear all scheduled posts')
      )
    )
    // library
    .addSubcommand(sub => sub
      .setName('library')
      .setDescription('Manage content library')
      .addSubcommand(opt => opt
        .setName('add')
        .setDescription('Add content to library')
        .addStringOption(o => o.setName('title').setDescription('Title').setRequired(true))
        .addStringOption(o => o.setName('content').setDescription('Content').setRequired(true))
        .addStringOption(o => o.setName('tags').setDescription('Comma-separated tags').setRequired(false))
        .addBooleanOption(o => o.setName('evergreen').setDescription('Mark as evergreen').setRequired(false))
      )
      .addSubcommand(opt => opt
        .setName('list')
        .setDescription('List library entries')
      )
      .addSubcommand(opt => opt
        .setName('search')
        .setDescription('Search library')
        .addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true))
      )
    )
    // trends
    .addSubcommand(sub => sub
      .setName('trends')
      .setDescription('Show recent detected trends')
    )
    // analytics
    .addSubcommand(sub => sub
      .setName('analytics')
      .setDescription('Show content performance analytics')
    )
    // campaign
    .addSubcommand(sub => sub
      .setName('campaign')
      .setDescription('Manage campaigns')
      .addSubcommand(opt => opt
        .setName('create')
        .setDescription('Create a new campaign')
        .addStringOption(o => o.setName('name').setDescription('Campaign name').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Campaign type').setRequired(true)
          .addChoices(
            { name: 'Token Launch', value: 'token_launch' },
            { name: 'Airdrop', value: 'airdrop' },
            { name: 'Governance', value: 'governance' },
            { name: 'Custom', value: 'default' }
          )
        )
      )
      .addSubcommand(opt => opt
        .setName('list')
        .setDescription('List active campaigns')
      )
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};