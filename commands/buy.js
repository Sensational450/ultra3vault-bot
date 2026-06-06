/**
 * 💎 VIP Buy Command v5.0
 * - Initiate VIP subscription purchase
 * - Emits 'command.buy' event for vipAgent
 */
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: {
    name: 'buy',
    description: '💎 Purchase a VIP subscription',
    options: [
      {
        name: 'plan',
        type: 3, // STRING
        description: 'Subscription plan duration',
        required: true,
        choices: [
          { name: '7 days', value: '7d' },
          { name: '14 days', value: '14d' },
          { name: '30 days', value: '30d' },
        ],
      },
    ],
  },

  async execute(interaction, deps = {}) {
    const { eventBus, logger } = deps;
    await interaction.deferReply({ ephemeral: true });
    if (eventBus) {
      eventBus.emit('command.buy', { interaction });
      logger?.debug(`📡 Buy command emitted for user ${interaction.user.id}`);
    } else {
      await interaction.editReply({ content: '❌ Purchase system unavailable.' });
    }
  },
};
