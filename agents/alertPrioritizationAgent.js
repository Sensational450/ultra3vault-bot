/**
 * 🧠 AlertPrioritizationAgent v5.0
 * - Listens to 'news.published' events from NewsAgent
 * - Scores importance using OpenAI (if key present) + keyword analysis
 * - Emits 'news.important' only for high-value news
 * - Configurable threshold via ALERT_PRIORITY_THRESHOLD (default 0.5)
 * - Reduces noise and keeps your community focused
 */
const BaseAgent = require('./baseAgent');

class AlertPrioritizationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.threshold = parseFloat(process.env.ALERT_PRIORITY_THRESHOLD) || 0.5;
    this.minLength = parseInt(process.env.ALERT_MIN_LENGTH) || 20;
    this.importantKeywords = [
      'breaking', 'urgent', 'critical', 'major', 'new', 'update',
      'launch', 'hack', 'exploit', 'regulatory', 'sec', 'etf',
      'approval', 'rejection', 'partnership', 'integration',
      'mainnet', 'testnet', 'upgrade', 'fork', 'airdrop'
    ];
  }

  async init() {
    await super.init();
    this.subscribe('news.published', async (data) => {
      const { item, category } = data;
      const importance = await this.evaluateImportance(item);
      if (importance.score >= this.threshold) {
        this.logger.debug(`✅ Important: ${item.title} (score: ${importance.score.toFixed(2)})`);
        this.emit('news.important', { item, category, importance });
      } else {
        this.logger.debug(`⏭️ Ignored low-priority: ${item.title} (score: ${importance.score.toFixed(2)})`);
      }
    });
    this.logger.info('🧠 AlertPrioritizationAgent ready (threshold: ' + this.threshold + ')');
  }

  /**
   * Score news importance (0-1)
   */
  async evaluateImportance(item) {
    const title = item.title || '';
    const description = item.description || item.contentSnippet || '';
    const text = (title + ' ' + description).toLowerCase();

    // 1. Length filter (short text is rarely important)
    if (text.length < this.minLength) {
      return { score: 0, reason: 'too short' };
    }

    // 2. Keyword scoring (fast)
    let keywordScore = 0;
    for (const kw of this.importantKeywords) {
      if (text.includes(kw)) keywordScore += 0.12;
    }
    keywordScore = Math.min(keywordScore, 0.6); // cap at 0.6

    // 3. AI scoring (if OpenAI key is available)
    let aiScore = keywordScore;
    if (this.deps.openai) {
      try {
        const prompt = `Rate the importance of this crypto news on a scale of 0 to 1, where 1 is extremely important (e.g., major regulatory change, security breach, ETF approval, billion-dollar hack) and 0 is trivial (e.g., minor price movement, meme coin speculation). Return only a number between 0 and 1.\n\nTitle: ${title}\nDescription: ${description}`;
        const response = await this.deps.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 5,
          temperature: 0,
        });
        const score = parseFloat(response.choices[0].message.content);
        if (!isNaN(score) && score >= 0 && score <= 1) {
          aiScore = score;
        }
      } catch (err) {
        this.logger.error(`OpenAI scoring error: ${err.message}`);
      }
    }

    // 4. Combine (use AI if available, else fallback to keyword)
    const finalScore = this.deps.openai ? aiScore : keywordScore;
    return {
      score: Math.min(Math.max(finalScore, 0), 1),
      source: this.deps.openai ? 'ai' : 'keyword',
    };
  }
}

module.exports = AlertPrioritizationAgent;