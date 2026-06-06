/**
 * 🎟️ Redeem Command v5.0
 * - Redeem a VIP key, referral code, or promo code
 * - Emits 'command.redeem' event for vipAgent or referralAgent
 */
module.exports = {
  data: {
    name: 'redeem',
    description: '🎟️ Redeem a VIP code or referral code',
    options: [
      {
        name: 'code',
        type: 3, // STRING
        description: 'Your unique redemption code',
        required: true,
      },
    ],
  },

  async execute(interaction, deps = {}) {
    const { eventBus, logger } = deps;
    await interaction.deferReply({ ephemeral: true });
    if (eventBus) {
      eventBus.emit('command.redeem', { interaction });
      logger?.debug(`📡 Redeem command emitted for user ${interaction.user.id}`);
    } else {
      await interaction.editReply({ content: '❌ Redemption system unavailable.' });
    }
  },
};
