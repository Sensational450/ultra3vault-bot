const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('donate')
    .setDescription('💖 Support the bot and server with a crypto donation'),

  async execute(interaction) {
    // Read wallet from environment variables
    const walletAddress = process.env.DONATION_WALLET;
    const currency = process.env.DONATION_CURRENCY || 'USDT';
    const network = process.env.DONATION_NETWORK || 'Ethereum (ERC-20)';

    if (!walletAddress) {
      return interaction.reply({
        content: '❌ Donations are not set up yet. Please contact an admin.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('💖 Support Ultra3Vault')
      .setDescription(
        'Thank you for considering a donation! Your support helps keep the bot running and funds future development. ❤️'
      )
      .setColor(0xffd700)
      .addFields(
        {
          name: `📤 Send ${currency}`,
          value: `\`${walletAddress}\``,
          inline: false,
        },
        {
          name: '🌐 Network',
          value: network,
          inline: true,
        },
        {
          name: '⚠️ Important',
          value: 'Only send **USDT (ERC-20)** on the Ethereum network. Sending other tokens or using the wrong network may result in loss of funds.',
          inline: false,
        },
        {
          name: '💡 Tip',
          value: 'You can also use `/subscribe` to unlock premium features!',
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Donations are non-refundable' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};