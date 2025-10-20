/**
 * LLM client abstractions used by ACE components.
 */

import { ok } from "assert";
import { pipeline, env } from '@xenova/transformers';
import { GoogleGenerativeAI } from '@google/generative-ai';

env.allowLocalModels = false;

export interface LLMResponse {
  text: string;
  raw?: Record<string, any>;
}

export abstract class LLMClient {
  constructor(public model?: string) {}

  abstract complete(prompt: string, ...kwargs: any[]): Promise<LLMResponse>;
}

export class GeminiLLMClient extends LLMClient {
  private client: GoogleGenerativeAI;

  constructor(model: string) {
    super(model);
    ok(process.env.GEMINI_API_KEY, 'GEMINI_API_KEY environment variable not set.');
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  async complete(prompt: string, ...kwargs: any[]): Promise<LLMResponse> {
    const model = this.client.getGenerativeModel({ model: this.model! });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return {
      text,
      raw: result.response,
    };
  }
}

export class DummyLLMClient extends LLMClient {
  private responses: string[];

  constructor(responses?: string[]) {
    super("dummy");
    this.responses = responses || [];
  }

  queue(text: string): void {
    this.responses.push(text);
  }

  async complete(prompt: string, ...kwargs: any[]): Promise<LLMResponse> {
    ok(this.responses.length > 0, "DummyLLMClient ran out of queued responses.");
    return {
      text: this.responses.shift()!,
    };
  }
}

export class TransformerLLMClient extends LLMClient {
  private pipe: any;

  private constructor(model: string, pipe: any) {
    super(model);
    this.pipe = pipe;
  }

  static async create(model: string) {
    const pipe = await pipeline('text-generation', model);
    return new TransformerLLMClient(model, pipe);
  }

  async complete(prompt: string, ...kwargs: any[]): Promise<LLMResponse> {
    const output = await this.pipe(prompt, ...kwargs);
    return {
      text: output[0].generated_text,
      raw: output,
    };
  }
}
