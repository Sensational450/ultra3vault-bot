/**
 * 🌍 LocalizationAgent v6.1
 * - Detects language of messages/text
 * - Translates between 100+ languages (configurable provider order: libre, mymemory, openai, gemini)
 * - Stores user language preferences in the database
 * - Integrates with AiChatAgent for multilingual conversations
 * - Slash commands: /translate, /setlanguage, /detect
 * - No hardcoded repetitive content – provider order configurable via env
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class LocalizationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.models = deps.models;

    // ---- Language list (static) ----
    this.defaultLanguage = 'en';
    this.supportedLanguages = [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'ar', name: 'Arabic' },
      { code: 'hi', name: 'Hindi' },
      { code: 'vi', name: 'Vietnamese' },
      { code: 'th', name: 'Thai' },
      { code: 'id', name: 'Indonesian' },
      { code: 'tr', name: 'Turkish' },
      { code: 'pl', name: 'Polish' },
      { code: 'nl', name: 'Dutch' },
      { code: 'sv', name: 'Swedish' },
      { code: 'no', name: 'Norwegian' },
      { code: 'da', name: 'Danish' },
      { code: 'fi', name: 'Finnish' },
      { code: 'el', name: 'Greek' },
      { code: 'he', name: 'Hebrew' },
    ];

    // ---- Translation cache ----
    this.cache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour

    // ---- Providers ----
    // OpenAI
    this.openai = null;
    if (this.deps.secrets?.openaiApiKey) {
      try {
        const { OpenAI } = require('openai');
        this.openai = new OpenAI({ apiKey: this.deps.secrets.openaiApiKey });
        this.logger.info('🧠 OpenAI initialized for LocalizationAgent');
      } catch (err) {
        this.logger.warn(`OpenAI init failed: ${err.message}`);
      }
    }

    // Gemini
    this.useGemini = !!process.env.GEMINI_API_KEY;
    if (this.useGemini) {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
      this.logger.info(`🧠 Gemini available (model: ${this.geminiModel})`);
    } else {
      this.logger.warn('⚠️ GEMINI_API_KEY missing – Gemini disabled.');
    }

    // ---- Provider order ----
    const defaultOrder = ['libre', 'mymemory', 'openai', 'gemini'];
    const envOrder = process.env.LOCALIZATION_PROVIDER_ORDER;
    this.providerOrder = envOrder ? envOrder.split(',').map(p => p.trim()) : defaultOrder;
    // Filter out providers that are not available (e.g., openai if no key, gemini if no key)
    this.providerOrder = this.providerOrder.filter(p => {
      if (p === 'openai' && !this.openai) return false;
      if (p === 'gemini' && !this.useGemini) return false;
      return true;
    });
  }

  async init() {
    await super.init();
    this.logger.info(`🌍 LocalizationAgent v6.1 ready (provider order: ${this.providerOrder.join(' → ')})`);
  }

  // ---------- CORE TRANSLATION ----------
  async translate(text, targetLang, sourceLang = null) {
    if (!text || text.trim().length === 0) return text;
    if (targetLang === sourceLang) return text;

    // Check cache
    const cacheKey = `${text.substring(0, 100)}_${sourceLang || 'auto'}_${targetLang}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.translation;
      }
    }

    let translation = null;

    // Try providers in configured order
    for (const provider of this.providerOrder) {
      if (translation) break;
      switch (provider) {
        case 'libre':
          translation = await this._translateLibre(text, targetLang, sourceLang);
          break;
        case 'mymemory':
          translation = await this._translateMyMemory(text, targetLang, sourceLang);
          break;
        case 'openai':
          translation = await this._translateOpenAI(text, targetLang, sourceLang);
          break;
        case 'gemini':
          translation = await this._translateGemini(text, targetLang, sourceLang);
          break;
        default:
          this.logger.warn(`Unknown provider: ${provider}`);
      }
      if (translation) {
        this.logger.debug(`✅ Translation successful using ${provider}`);
        break;
      }
    }

    // Fallback: return original text if all providers fail
    if (!translation) {
      this.logger.warn(`All translation providers failed for ${targetLang}, returning original`);
      return text;
    }

    // Cache the result
    this.cache.set(cacheKey, { translation, timestamp: Date.now() });
    return translation;
  }

  // ---------- PROVIDER: LibreTranslate ----------
  async _translateLibre(text, targetLang, sourceLang = null) {
    try {
      const url = 'https://libretranslate.com/translate';
      const payload = {
        q: text,
        source: sourceLang || 'auto',
        target: targetLang,
        format: 'text',
      };
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      });
      if (response.data?.translatedText) {
        return response.data.translatedText;
      }
    } catch (err) {
      this.logger.debug(`LibreTranslate failed: ${err.message}`);
    }
    return null;
  }

  // ---------- PROVIDER: MyMemory ----------
  async _translateMyMemory(text, targetLang, sourceLang = null) {
    try {
      const url = 'https://api.mymemory.translated.net/get';
      const params = {
        q: text,
        langpair: `${sourceLang || 'auto'}|${targetLang}`,
      };
      const response = await axios.get(url, { params, timeout: 5000 });
      if (response.data?.responseData?.translatedText) {
        return response.data.responseData.translatedText;
      }
    } catch (err) {
      this.logger.debug(`MyMemory failed: ${err.message}`);
    }
    return null;
  }

  // ---------- PROVIDER: OpenAI ----------
  async _translateOpenAI(text, targetLang, sourceLang = null) {
    if (!this.openai) return null;
    try {
      const prompt = `Translate the following text from ${sourceLang || 'auto'} to ${targetLang}. Return ONLY the translation, nothing else.\n\nText: ${text}`;
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      });
      return response.choices[0].message.content.trim();
    } catch (err) {
      this.logger.debug(`OpenAI translation failed: ${err.message}`);
    }
    return null;
  }

  // ---------- PROVIDER: Gemini ----------
  async _translateGemini(text, targetLang, sourceLang = null) {
    if (!this.useGemini) return null;
    try {
      const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
      const prompt = `Translate the following text from ${sourceLang || 'auto'} to ${targetLang}. Return ONLY the translation, nothing else.\n\nText: ${text}`;
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.3,
        },
      });
      return result.response.text().trim();
    } catch (err) {
      this.logger.debug(`Gemini translation failed: ${err.message}`);
    }
    return null;
  }

  // ---------- LANGUAGE DETECTION ----------
  async detectLanguage(text) {
    if (!text || text.trim().length < 5) return 'en';

    // Try LibreTranslate
    try {
      const url = 'https://libretranslate.com/detect';
      const response = await axios.post(url, { q: text }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 3000,
      });
      if (response.data && response.data.length > 0) {
        const best = response.data.reduce((a, b) => a.confidence > b.confidence ? a : b);
        if (best.confidence > 0.6) {
          return best.language;
        }
      }
    } catch (err) {
      this.logger.debug(`Language detection failed: ${err.message}`);
    }

    // Fallback: heuristic detection
    const patterns = [
      { regex: /[áéíóúñç]/, code: 'es' },
      { regex: /[àâêîôûç]/, code: 'fr' },
      { regex: /[äöüß]/, code: 'de' },
      { regex: /[абвгдеёжзийклмнопрстуфхцчшщъыьэюя]/, code: 'ru' },
      { regex: /[αβγδεζηθικλμνξοπρσςτυφχψω]/, code: 'el' },
      { regex: /[\u0600-\u06FF]/, code: 'ar' },
      { regex: /[\u4E00-\u9FFF]/, code: 'zh' },
      { regex: /[\uAC00-\uD7AF]/, code: 'ko' },
      { regex: /[\u3040-\u30FF]/, code: 'ja' },
    ];

    for (const p of patterns) {
      if (p.regex.test(text)) {
        return p.code;
      }
    }

    return 'en';
  }

  // ---------- GET USER LANGUAGE ----------
  async getUserLanguage(userId, guildId) {
    try {
      const user = await this.models.User.findOne({ where: { userId, guildId } });
      if (user?.language) return user.language;
    } catch {}
    return this.defaultLanguage;
  }

  // ---------- SET USER LANGUAGE ----------
  async setUserLanguage(userId, guildId, language) {
    try {
      let user = await this.models.User.findOne({ where: { userId, guildId } });
      if (!user) {
        user = await this.models.User.create({ userId, guildId, language });
      } else {
        user.language = language;
        await user.save();
      }
      return true;
    } catch (err) {
      this.logger.error(`Failed to set language: ${err.message}`);
      return false;
    }
  }

  // ---------- MESSAGE HANDLER ----------
  async onMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content || message.content.length < 10) return;

    const detectedLang = await this.detectLanguage(message.content);
    if (detectedLang !== 'en' && detectedLang !== this.defaultLanguage) {
      const translation = await this.translate(message.content, 'en', detectedLang);
      if (translation && translation !== message.content) {
        message.translatedContent = translation;
        message.originalLanguage = detectedLang;
        this.logger.debug(`🌍 Translated: "${message.content.substring(0, 30)}..." → "${translation.substring(0, 30)}..."`);
      }
    }

    const userLang = await this.getUserLanguage(message.author.id, message.guild.id);
    if (userLang !== detectedLang && detectedLang !== 'en') {
      await this.setUserLanguage(message.author.id, message.guild.id, detectedLang);
    }
  }

  // ---------- TRANSLATE BOT RESPONSE ----------
  async translateBotResponse(text, userId, guildId) {
    const language = await this.getUserLanguage(userId, guildId);
    if (language === this.defaultLanguage) return text;
    return this.translate(text, language, 'en');
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    switch (commandName) {
      case 'translate':
        await this.cmdTranslate(interaction);
        break;
      case 'setlanguage':
        await this.cmdSetLanguage(interaction);
        break;
      case 'detect':
        await this.cmdDetect(interaction);
        break;
      case 'languages':
        await this.cmdLanguages(interaction);
        break;
    }
  }

  async cmdTranslate(interaction) {
    const text = interaction.options.getString('text');
    const targetLang = interaction.options.getString('language');

    if (!this.supportedLanguages.find(l => l.code === targetLang)) {
      return interaction.reply({
        content: `❌ Language "${targetLang}" is not supported. Use /languages to see all.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const translated = await this.translate(text, targetLang);
      const detected = await this.detectLanguage(text);

      const embed = new EmbedBuilder()
        .setTitle('🌍 Translation')
        .setColor(0x3498db)
        .addFields(
          { name: '📝 Original', value: text.substring(0, 500), inline: false },
          { name: '🔄 Translated', value: translated.substring(0, 500), inline: false },
          { name: '🔍 Detected', value: this._getLanguageName(detected), inline: true },
          { name: '🎯 Target', value: this._getLanguageName(targetLang), inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      this.logger.error(`Translate error: ${err.message}`);
      await interaction.editReply({ content: '❌ Translation failed. Please try again later.' });
    }
  }

  async cmdSetLanguage(interaction) {
    const language = interaction.options.getString('language');

    if (!this.supportedLanguages.find(l => l.code === language)) {
      return interaction.reply({
        content: `❌ Language "${language}" is not supported. Use /languages to see all.`,
        ephemeral: true,
      });
    }

    const success = await this.setUserLanguage(interaction.user.id, interaction.guild.id, language);

    if (success) {
      await interaction.reply({
        content: `✅ Your preferred language has been set to **${this._getLanguageName(language)}**. Bot responses will now be translated to your language (if supported).`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ Failed to save language preference. Please try again.',
        ephemeral: true,
      });
    }
  }

  async cmdDetect(interaction) {
    const text = interaction.options.getString('text');
    await interaction.deferReply({ ephemeral: true });

    try {
      const detected = await this.detectLanguage(text);
      const name = this._getLanguageName(detected);

      const embed = new EmbedBuilder()
        .setTitle('🔍 Language Detection')
        .setColor(0x00ff88)
        .addFields(
          { name: '📝 Text', value: text.substring(0, 200), inline: false },
          { name: '🌐 Detected Language', value: `${name} (${detected})`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: '❌ Detection failed.' });
    }
  }

  async cmdLanguages(interaction) {
    const list = this.supportedLanguages.map(l => `\`${l.code}\` → ${l.name}`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle('🌍 Supported Languages')
      .setDescription(list)
      .setColor(0x3498db)
      .setFooter({ text: `Total: ${this.supportedLanguages.length} languages` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ---------- HELPERS ----------
  _getLanguageName(code) {
    const found = this.supportedLanguages.find(l => l.code === code);
    return found ? found.name : code;
  }
}

module.exports = LocalizationAgent;