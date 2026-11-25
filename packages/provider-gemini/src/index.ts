import {
  AIProviderError,
  decodeSseStream,
  estimateTokens,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
  type ConnectionTest,
} from '@codevideo/ai-gateway';

export interface GeminiProviderOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    this.defaultModel = options.defaultModel ?? 'gemini-2.0-flash';
  }

  private get model(): string {
    return this.defaultModel.replace(/^models\//, '');
  }

  private url(action: string): string {
    return `${this.baseUrl}/v1beta/models/${this.model}:${action}?key=${encodeURIComponent(this.apiKey)}`;
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(
      `${this.baseUrl}/v1beta/models?key=${encodeURIComponent(this.apiKey)}`,
    );
    if (!response.ok) {
      throw new AIProviderError(
        `Failed to list models: ${response.status}`,
        this.id,
        response.status,
      );
    }
    const payload = (await response.json()) as {
      models?: Array<{name?: string}>;
    };
    return (payload.models ?? []).flatMap(model =>
      model.name ? [model.name.replace(/^models\//, '')] : [],
    );
  }

  private body(request: ChatRequest) {
    const system = request.messages
      .filter(message => message.role === 'system')
      .map(message => message.content)
      .join('\n');
    return {
      systemInstruction: system ? {parts: [{text: system}]} : undefined,
      contents: request.messages
        .filter(message => message.role !== 'system')
        .map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{text: message.content}],
        })),
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 2048,
        responseMimeType: request.jsonMode ? 'application/json' : undefined,
      },
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(this.url('generateContent'), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: request.signal,
      body: JSON.stringify(this.body(request)),
    });
    if (!response.ok) {
      throw new AIProviderError(
        `Chat request failed: ${response.status} ${await response.text()}`,
        this.id,
        response.status,
      );
    }
    const payload = (await response.json()) as {
      candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
      usageMetadata?: {promptTokenCount?: number; candidatesTokenCount?: number};
    };
    const text =
      payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') ?? '';
    return {
      text,
      model: this.model,
      usage: payload.usageMetadata
        ? {
            promptTokens: payload.usageMetadata.promptTokenCount ?? 0,
            completionTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens:
              (payload.usageMetadata.promptTokenCount ?? 0) +
              (payload.usageMetadata.candidatesTokenCount ?? 0),
          }
        : {promptTokens: 0, completionTokens: estimateTokens(text), totalTokens: estimateTokens(text)},
      raw: payload,
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<string> {
    const response = await fetch(`${this.url('streamGenerateContent')}&alt=sse`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: request.signal,
      body: JSON.stringify(this.body(request)),
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
        candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
      };
      const text =
        payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') ?? '';
      if (text) yield text;
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

export function createGeminiProvider(options: GeminiProviderOptions): AIProvider {
  return new GeminiProvider(options);
}
