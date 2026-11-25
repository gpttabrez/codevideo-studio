import {
  AIProviderError,
  estimateTokens,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
  type ConnectionTest,
  type ModelMessage,
  type ProviderCapabilities,
  type ToolDefinition,
} from '@codevideo/ai-gateway';

export interface OpenAICompatibleProviderOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  headers?: Record<string, string>;
  supportsVision?: boolean;
  supportsToolCalling?: boolean;
  jsonMode?: boolean;
  streaming?: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {url: string};
}

interface OpenAIMessage {
  role: string;
  content: string | OpenAIContentPart[];
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultModel: string;
  private readonly headers: Record<string, string>;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.id;
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel;
    this.headers = options.headers ?? {};
    this.capabilities = {
      text: true,
      streaming: options.streaming ?? true,
      jsonMode: options.jsonMode ?? false,
      toolCalling: options.supportsToolCalling ? 'json-protocol' : false,
      vision: options.supportsVision ?? false,
      maxInputTokens: options.maxInputTokens,
      maxOutputTokens: options.maxOutputTokens,
    };
  }

  private requestHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? {Authorization: `Bearer ${this.apiKey}`} : {}),
      ...this.headers,
    };
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: this.requestHeaders(),
      signal,
    });
    if (!response.ok) {
      throw new AIProviderError(
        `Failed to list models: ${response.status} ${await response.text()}`,
        this.id,
        response.status,
      );
    }
    const payload = await response.json() as {data?: Array<{id?: string}>};
    return (payload.data ?? []).flatMap(item => item.id ? [item.id] : []);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.requestHeaders(),
      signal: request.signal,
      body: JSON.stringify(this.body({
        messages: request.multimodalMessages ?? request.messages.map(message => ({
          role: message.role,
          content: message.content,
        })),
        model: request.model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        jsonMode: request.jsonMode,
        tools: request.tools,
        stream: false,
      })),
    });
    return this.parseResponse(response, request.model);
  }

  async chatWithMessages(request: {
    messages: ModelMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    tools?: ToolDefinition[];
    signal?: AbortSignal;
  }): Promise<ChatResponse> {
    return this.chat({
      messages: [],
      multimodalMessages: request.messages,
      model: request.model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      jsonMode: request.jsonMode,
      tools: request.tools,
      signal: request.signal,
    });
  }

  async *stream(request: ChatRequest): AsyncIterable<string> {
    if (!this.capabilities.streaming) throw new Error(`${this.name} streaming is disabled.`);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.requestHeaders(),
      signal: request.signal,
      body: JSON.stringify(this.body({
        messages: request.multimodalMessages ?? request.messages.map(message => ({
          role: message.role,
          content: message.content,
        })),
        model: request.model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        jsonMode: request.jsonMode,
        tools: request.tools,
        stream: true,
      })),
    });
    if (!response.ok || !response.body) {
      throw new AIProviderError(
        `Stream request failed: ${response.status} ${await response.text()}`,
        this.id,
        response.status,
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const line = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);
          if (line.startsWith('data:')) {
            const payload = line.slice(5).trim();
            if (payload && payload !== '[DONE]') {
              const parsed = JSON.parse(payload) as {choices?: Array<{delta?: {content?: string}}>};
              const chunk = parsed.choices?.[0]?.delta?.content;
              if (chunk) yield chunk;
            }
          }
          boundary = buffer.indexOf('\n');
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async testConnection(): Promise<ConnectionTest> {
    try {
      const models = await this.listModels();
      return {
        ok: true,
        message: `Connected to ${this.name}`,
        models: models.length ? models : [this.defaultModel],
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        models: [],
      };
    }
  }

  private body(input: {
    messages: ModelMessage[] | Array<{role: string; content?: string}>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    tools?: ToolDefinition[];
    stream: boolean;
  }): Record<string, unknown> {
    const instructions: string[] = [];
    if (input.tools?.length && !this.capabilities.toolCalling) {
      instructions.push(`Available tools: ${JSON.stringify(input.tools)}`);
    }
    const messages: OpenAIMessage[] = input.messages.map(message => {
      const role = message.role === 'tool' ? 'user' : message.role;
      const imageParts = 'images' in message && message.images?.length
        ? message.images.map(image => ({
            type: 'image_url' as const,
            image_url: {url: `data:${image.mimeType};base64,${image.data}`},
          }))
        : [];
      const text = 'content' in message && message.content ? message.content : '';
      const extras: string[] = [];
      if ('toolResults' in message && message.toolResults?.length) {
        extras.push(`TOOL_RESULTS ${JSON.stringify(message.toolResults)}`);
      }
      if ('toolCalls' in message && message.toolCalls?.length) {
        extras.push(`TOOL_CALLS ${JSON.stringify(message.toolCalls)}`);
      }
      const combined = [text, ...extras].filter(Boolean).join('\n');
      if (imageParts.length && this.capabilities.vision) {
        return {role, content: [{type: 'text', text: combined}, ...imageParts]};
      }
      return {role, content: combined};
    });
    if (instructions.length) {
      messages.unshift({role: 'system', content: instructions.join('\n')});
    }
    return {
      model: input.model ?? this.defaultModel,
      messages,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens,
      response_format: input.jsonMode && this.capabilities.jsonMode ? {type: 'json_object'} : undefined,
      stream: input.stream,
    };
  }

  private async parseResponse(response: Response, requestedModel?: string): Promise<ChatResponse> {
    if (!response.ok) {
      throw new AIProviderError(
        `Chat request failed: ${response.status} ${await response.text()}`,
        this.id,
        response.status,
      );
    }
    const payload = await response.json() as {
      choices?: Array<{message?: {content?: string}}>;
      model?: string;
      usage?: {prompt_tokens?: number; completion_tokens?: number; total_tokens?: number};
    };
    const text = payload.choices?.[0]?.message?.content ?? '';
    return {
      text,
      model: payload.model ?? requestedModel ?? this.defaultModel,
      usage: payload.usage ? {
        promptTokens: payload.usage.prompt_tokens ?? 0,
        completionTokens: payload.usage.completion_tokens ?? estimateTokens(text),
        totalTokens: payload.usage.total_tokens ?? 0,
      } : undefined,
      raw: payload,
    };
  }
}

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions,
): AIProvider {
  return new OpenAICompatibleProvider(options);
}
