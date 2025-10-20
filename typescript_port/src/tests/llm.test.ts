
import { TransformerLLMClient } from '../llm';

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn().mockResolvedValue(
    jest.fn().mockResolvedValue([{ generated_text: 'a beautiful day.' }])
  ),
  env: {
    allowLocalModels: false,
  },
}));

describe('TransformerLLMClient', () => {
  it('should return a completion', async () => {
    const client = await TransformerLLMClient.create('Xenova/distilgpt2');
    const response = await client.complete('It is');
    expect(response.text).toBe('a beautiful day.');
  });
});
