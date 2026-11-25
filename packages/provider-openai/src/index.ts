import {
  AIProviderError,
  decodeSseStream,
  estimateTokens,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
  type ConnectionTest,
} from '@codevideo/ai-gateway';

export interface OpenAIProviderOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  id?: string;
  name?: string;
}

export class OpenAIProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(options: OpenAIProviderOptions) {
    this.id = options.id ?? 'openai';
    this.name = options.name ?? 'OpenAI';
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.defaultModel = options.defaultModel ?? 'gpt-4o-mini';
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: this.headers(),
      signal,
    });
    if (!response.ok) {
      throw new AIProviderError(
        `Failed to list models: ${response.status} ${await response.text()}`,
        this.id,
        response.status,
      );
    }
    const payload = (await response.json()) as {data?: Array<{id: string}>};
    return (payload.data ?? []).map(model => model.id);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      signal: request.signal,
      body: JSON.stringify({
        model: request.model ?? this.defaultModel,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        response_format: request.jsonMode ? {type: 'json_object'} : undefined,
        stream: false,
      }),
    });
    if (!response.ok) {
      throw new AIProviderError(
        `Chat request failed: ${response.status} ${await response.text()}`,
        this.id,
        response.status,
      );
    }
    const payload = (await response.json()) as {
      choices?: Array<{message?: {content?: string}}>;
      model?: string;
      usage?: {prompt_tokens?: number; completion_tokens?: number; total_tokens?: number};
    };
    const text = payload.choices?.[0]?.message?.content ?? '';
    return {
      text,
      model: payload.model ?? request.model ?? this.defaultModel,
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens ?? estimateTokens(''),
            completionTokens: payload.usage.completion_tokens ?? estimateTokens(text),
            totalTokens: payload.usage.total_tokens ?? 0,
          }
        : undefined,
      raw: payload,
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      signal: request.signal,
      body: JSON.stringify({
        model: request.model ?? this.defaultModel,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        response_format: request.jsonMode ? {type: 'json_object'} : undefined,
        stream: true,
      }),
    });
    if (!response.ok || !response.body) {
      throw new AIProviderError(
        `Stream request failed: ${response.status} ${await response.text()}`,
        this.id,
        response.status,
      );
    }
    for await (const data of decodeSseStream(response.body)) {
      const payload = JSON.parse(data) as {
        choices?: Array<{delta?: {content?: string}}>;
      };
      const chunk = payload.choices?.[0]?.delta?.content;
      if (chunk) yield chunk;
    }
  }

  async testConnection(): Promise<ConnectionTest> {
    try {
      const models = await this.listModels();
      return {ok: true, message: `Connected to ${this.name}`, models};
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        models: [],
      };
    }
  }
}

export function createOpenAIProvider(options: OpenAIProviderOptions): AIProvider {
  return new OpenAIProvider(options);
}
