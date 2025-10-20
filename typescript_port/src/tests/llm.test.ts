import { TransformerLLMClient, GeminiLLMClient } from '../llm';

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn().mockResolvedValue(
    jest.fn().mockResolvedValue([{ generated_text: 'a beautiful day.' }])
  ),
  env: {
    allowLocalModels: false,
  },
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'a beautiful day.',
        },
      }),
    }),
  })),
}));

describe('TransformerLLMClient', () => {
  it('should return a completion', async () => {
    const client = await TransformerLLMClient.create('Xenova/distilgpt2');
    const response = await client.complete('It is');
    expect(response.text).toBe('a beautiful day.');
  });
});

describe('GeminiLLMClient', () => {
  it('should return a completion', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const client = new GeminiLLMClient('gemini-2.5-pro');
    const response = await client.complete('It is');
    expect(response.text).toBe('a beautiful day.');
    delete process.env.GEMINI_API_KEY;
  });
});