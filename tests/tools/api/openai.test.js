// openai.test.js
// OpenAI SDK v5.0 Tests with Jest and Nock

const OpenAI = require('openai');
const nock = require('nock');

// You can use a fake key when all calls are mocked
const TEST_API_KEY = 'sk-test-mock-key';

describe('OpenAI v5.0 Client', () => {
  let openai;

  beforeEach(() => {
    openai = new OpenAI({ apiKey: TEST_API_KEY });
    // Disable retries for faster testing
    openai.maxRetries = 0;
    // Ensure all external HTTP calls are mocked
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe('Chat Completions', () => {
    it('should create a basic chat completion', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?',
              refusal: null,
            },
            logprobs: null,
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 9, total_tokens: 19 },
      };

      nock('https://api.openai.com')
        .post('/v1/chat/completions', (body) => {
          return body.model === 'gpt-4o' && body.messages.length > 0;
        })
        .reply(200, mockResponse);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(completion).toMatchObject({
        model: 'gpt-4o',
        choices: expect.arrayContaining([
          expect.objectContaining({
            message: expect.objectContaining({ role: 'assistant' }),
          }),
        ]),
      });
      expect(completion.choices[0].message.content).toBe('Hello! How can I help you?');
    });

    it('should handle streaming completions', async () => {
      // Mock streaming chunks (SSE format)
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" world!"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, chunks.join(''), {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

      const stream = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      });

      let collected = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        collected += content;
      }
      expect(collected).toBe('Hello world!');
    });

    it('should throw an API error on bad request', async () => {
      const errorResponse = {
        error: {
          message: "The model `gpt-5` does not exist or you do not have access to it.",
          type: "invalid_request_error",
          param: "model",
          code: "model_not_found"
        }
      };

      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(404, errorResponse);

      await expect(
        openai.chat.completions.create({
          model: 'gpt-5',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow(OpenAI.NotFoundError);
    });
  });

  describe('Authentication', () => {
    it('should throw an authentication error with invalid key', async () => {
      const badClient = new OpenAI({ apiKey: 'invalid-key' });

      const errorResponse = {
        error: {
          message: "Incorrect API key provided: invalid-key.",
          type: "invalid_request_error",
          code: "invalid_api_key"
        }
      };

      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(401, errorResponse);

      await expect(
        badClient.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow(OpenAI.AuthenticationError);
    });
  });
});