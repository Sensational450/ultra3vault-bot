/**
 * 🧪 BaseAgent Unit Tests v5.0
 * - Tests abstract class constraints
 * - Tests lifecycle methods (init, destroy, onReady, etc.)
 * - Tests event subscription (subscribe, emit)
 * - Tests error handling and logging
 */
const BaseAgent = require('../../agents/baseAgent');

// ---------- Mocks ----------
const mockEventBus = { on: jest.fn(), emit: jest.fn(), off: jest.fn() };
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const mockClient = { user: { tag: 'TestBot' } };
const mockDb = { run: jest.fn() };
const mockCache = { get: jest.fn(), set: jest.fn() };

describe('BaseAgent', () => {
  // Helper to create a concrete agent for testing
  class ConcreteAgent extends BaseAgent {
    setupListeners() {
      this.subscribe('test.event', this.handleTestEvent.bind(this));
    }
    async handleTestEvent(data) {
      this.testData = data;
    }
    async onMessage(message) {
      this.lastMessage = message;
    }
    async onInteraction(interaction) {
      this.lastInteraction = interaction;
    }
    async onGuildMemberAdd(member) {
      this.lastMember = member;
    }
    async onReady() {
      this.readyCalled = true;
    }
  }

  let agent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new ConcreteAgent(mockEventBus, {
      client: mockClient,
      logger: mockLogger,
      db: mockDb,
      cache: mockCache,
    });
  });

  describe('constructor and abstract class', () => {
    it('should throw if instantiated directly', () => {
      expect(() => new BaseAgent(mockEventBus, {})).toThrow('BaseAgent is abstract and cannot be instantiated directly');
    });

    it('should set properties correctly', () => {
      expect(agent.eventBus).toBe(mockEventBus);
      expect(agent.deps).toEqual({ client: mockClient, logger: mockLogger, db: mockDb, cache: mockCache });
      expect(agent.name).toBe('ConcreteAgent');
      expect(agent.initialised).toBe(false);
      expect(agent._listeners).toBeInstanceOf(Map);
    });

    it('should call setupListeners automatically', () => {
      expect(agent._listeners.size).toBeGreaterThan(0);
      const handler = agent._listeners.get('test.event');
      expect(handler).toBeDefined();
    });
  });

  describe('init method', () => {
    it('should set initialised to true and log', async () => {
      await agent.init();
      expect(agent.initialised).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('ConcreteAgent initialising...');
    });
  });

  describe('subscribe method', () => {
    it('should wrap handler with error logging and emit error event', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Test error'));
      const unsubscribe = agent.subscribe('error.event', errorHandler);
      expect(mockEventBus.on).toHaveBeenCalledWith('error.event', expect.any(Function));
      // Get the wrapped handler
      const wrapped = mockEventBus.on.mock.calls[0][1];
      await wrapped('some data');
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith('agent.error', expect.objectContaining({ agent: 'ConcreteAgent', event: 'error.event', error: expect.any(Error) }));
      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('should return unsubscribe function that removes listener', () => {
      const handler = jest.fn();
      const unsubscribe = agent.subscribe('test', handler);
      expect(mockEventBus.on).toHaveBeenCalled();
      unsubscribe();
      expect(mockEventBus.off).toHaveBeenCalledWith('test', expect.any(Function));
      expect(agent._listeners.has('test')).toBe(false);
    });
  });

  describe('emit method', () => {
    it('should forward to eventBus.emit', () => {
      agent.emit('custom.event', { foo: 'bar' });
      expect(mockEventBus.emit).toHaveBeenCalledWith('custom.event', { foo: 'bar' });
    });
  });

  describe('lifecycle hooks (default implementations)', () => {
    it('onMessage should be overridable', async () => {
      const testMsg = { content: 'hello' };
      await agent.onMessage(testMsg);
      expect(agent.lastMessage).toBe(testMsg);
    });

    it('onInteraction should be overridable', async () => {
      const testInteraction = { commandName: 'ping' };
      await agent.onInteraction(testInteraction);
      expect(agent.lastInteraction).toBe(testInteraction);
    });

    it('onGuildMemberAdd should be overridable', async () => {
      const testMember = { user: { id: '123' } };
      await agent.onGuildMemberAdd(testMember);
      expect(agent.lastMember).toBe(testMember);
    });

    it('onReady should be overridable', async () => {
      await agent.onReady();
      expect(agent.readyCalled).toBe(true);
    });
  });

  describe('destroy method', () => {
    beforeEach(() => {
      // Add some listeners
      agent.subscribe('event1', jest.fn());
      agent.subscribe('event2', jest.fn());
    });

    it('should remove all listeners and set initialised to false', () => {
      agent.destroy();
      expect(mockEventBus.off).toHaveBeenCalledTimes(2);
      expect(agent._listeners.size).toBe(0);
      expect(agent.initialised).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('ConcreteAgent destroying...');
    });
  });
});