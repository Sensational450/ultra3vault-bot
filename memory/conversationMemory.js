/**
 * 💬 ConversationMemory v5.0
 * - Sliding window of chat messages per user (or per channel)
 * - Automatic pruning (max messages, max age)
 * - Event bus integration for memory changes
 * - Supports custom metadata per message
 */
class ConversationMemory {
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 50;        // max messages per conversation
    this.maxAgeMs = options.maxAgeMs || 3600000;        // 1 hour default
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;
    // storage: Map<conversationId, Array<{ role, content, timestamp, metadata }>>
    this.conversations = new Map();
  }

  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  _getConversationId(userId, channelId = null) {
    return channelId ? `${userId}:${channelId}` : userId;
  }

  // ➕ Add a message to a conversation (e.g., user or assistant)
  add(conversationId, role, content, metadata = {}) {
    const id = conversationId;
    if (!this.conversations.has(id)) {
      this.conversations.set(id, []);
    }
    const messages = this.conversations.get(id);
    const timestamp = Date.now();
    messages.push({ role, content, timestamp, metadata });
    // Prune old messages by age
    const cutoff = timestamp - this.maxAgeMs;
    while (messages.length && messages[0].timestamp < cutoff) {
      messages.shift();
    }
    // Prune by count
    while (messages.length > this.maxMessages) {
      messages.shift();
    }
    this._emit('conversation.added', { id, role, length: messages.length });
    return this;
  }

  // 🔍 Get all messages for a conversation
  get(conversationId) {
    const messages = this.conversations.get(conversationId) || [];
    return [...messages];
  }

  // 🧹 Clear a conversation
  clear(conversationId) {
    const existed = this.conversations.delete(conversationId);
    if (existed) this._emit('conversation.cleared', { id: conversationId });
    return existed;
  }

  // 📋 Get last N messages
  getLast(conversationId, n = 10) {
    const messages = this.conversations.get(conversationId) || [];
    return messages.slice(-n);
  }

  // 🧪 Format conversation for OpenAI API (system + user + assistant)
  formatForOpenAI(conversationId, systemPrompt = null) {
    const messages = this.get(conversationId);
    const formatted = [];
    if (systemPrompt) formatted.push({ role: 'system', content: systemPrompt });
    for (const msg of messages) {
      formatted.push({ role: msg.role, content: msg.content });
    }
    return formatted;
  }

  // 📊 Get stats for a conversation
  stats(conversationId) {
    const messages = this.conversations.get(conversationId) || [];
    return {
      messageCount: messages.length,
      oldestTimestamp: messages[0]?.timestamp || null,
      newestTimestamp: messages[messages.length - 1]?.timestamp || null,
    };
  }

  // 🧹 Clear all conversations
  clearAll() {
    this.conversations.clear();
    this._emit('conversation.allCleared');
    this.logger.info('💬 All conversations cleared');
  }
}

module.exports = ConversationMemory;