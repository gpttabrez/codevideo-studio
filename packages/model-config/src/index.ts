import {
  AiGateway,
  loadModelRolesFromEnv,
  ModelManager,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
  type ConnectionTest,
  type ModelMessage,
  type ProviderCapabilities,
  type ToolDefinition,
} from '@codevideo/ai-gateway';
import {createAnthropicProvider} from '@codevideo/provider-anthropic';
import {createGeminiProvider} from '@codevideo/provider-gemini';
import {createOllamaProvider} from '@codevideo/provider-ollama';
import {createOpenAIProvider} from '@codevideo/provider-openai';
import {createOpenAICompatibleProvider} from '@codevideo/provider-openai-compatible';

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'openai-compatible';

export interface ProviderConfigEntry {
  id: string;
  type: ProviderType;
  name?: string;
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  capabilities?: Partial<ProviderCapabilities>;
}

function defaultCapabilities(type: ProviderType): ProviderCapabilities {
  return {
    text: true,
    streaming: true,
    jsonMode: type === 'openai' || type === 'openai-compatible' || type === 'ollama',
    toolCalling: false,
    vision: false,
  };
}

function toChatMessages(messages: ModelMessage[]): ChatRequest['messages'] {
  return messages.map(message => {
    const parts: string[] = [];
    if (message.content) parts.push(message.content);
    if (message.toolCalls?.length) parts.push(`TOOL_CALLS ${JSON.stringify(message.toolCalls)}`);
    if (message.toolResults?.length) parts.push(`TOOL_RESULTS ${JSON.stringify(message.toolResults)}`);
    return {
      role: message.role === 'tool' ? 'user' : message.role,
      content: parts.join('\n'),
    };
  });
}

function withCapabilities(provider: AIProvider, capabilities: ProviderCapabilities): AIProvider {
  return {
    id: provider.id,
    name: provider.name,
    capabilities,
    listModels: signal => provider.listModels(signal),
    chat: request => provider.chat(request),
    stream: request => provider.stream(request),
    testConnection: () => provider.testConnection(),
    chatWithMessages: provider.chatWithMessages
      ? request => provider.chatWithMessages!(request)
      : async request => {
          if (request.messages.some(message => message.images?.length) && !capabilities.vision) {
            throw new Error(`${provider.name} does not support image input.`);
          }
          if (request.messages.some(message => message.images?.length)) {
            throw new Error(`${provider.name} does not implement structured image input.`);
          }
          return provider.chat({
            messages: toChatMessages(request.messages),
            model: request.model,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            jsonMode: request.jsonMode,
            tools: request.tools,
            signal: request.signal,
          });
        },
  };
}

function resolveApiKey(entry: ProviderConfigEntry, env: NodeJS.ProcessEnv): string {
  if (entry.apiKeyEnv) return env[entry.apiKeyEnv] ?? '';
  return entry.apiKey ?? '';
}

function createProvider(entry: ProviderConfigEntry, env: NodeJS.ProcessEnv): AIProvider {
  const apiKey = resolveApiKey(entry, env);
  let provider: AIProvider;
  if (entry.type === 'openai') {
    provider = createOpenAIProvider({
      id: entry.id,
      name: entry.name ?? 'OpenAI',
      apiKey,
      baseUrl: entry.baseUrl,
      defaultModel: entry.defaultModel,
    });
  } else if (entry.type === 'anthropic') {
    provider = createAnthropicProvider({
      apiKey,
      baseUrl: entry.baseUrl,
      defaultModel: entry.defaultModel,
    });
  } else if (entry.type === 'gemini') {
    provider = createGeminiProvider({
      apiKey,
      baseUrl: entry.baseUrl,
      defaultModel: entry.defaultModel,
    });
  } else if (entry.type === 'ollama') {
    provider = createOllamaProvider({
      baseUrl: entry.baseUrl,
      defaultModel: entry.defaultModel,
    });
  } else {
    provider = createOpenAICompatibleProvider({
      id: entry.id,
      name: entry.name ?? entry.id,
      baseUrl: entry.baseUrl ?? '',
      defaultModel: entry.defaultModel ?? '',
      apiKey: apiKey || undefined,
      headers: entry.headers,
      supportsVision: entry.capabilities?.vision,
      supportsToolCalling: Boolean(entry.capabilities?.toolCalling),
      jsonMode: entry.capabilities?.jsonMode,
      streaming: entry.capabilities?.streaming,
    });
  }
  return withCapabilities(provider, {...defaultCapabilities(entry.type), ...entry.capabilities});
}

function legacyEntries(env: NodeJS.ProcessEnv): ProviderConfigEntry[] {
  const entries: ProviderConfigEntry[] = [];
  if (env.OPENAI_API_KEY) {
    entries.push({
      id: 'openai',
      type: 'openai',
      baseUrl: env.OPENAI_BASE_URL,
      defaultModel: env.OPENAI_MODEL,
      apiKey: env.OPENAI_API_KEY,
    });
  }
  if (env.ANTHROPIC_API_KEY) {
    entries.push({
      id: 'anthropic',
      type: 'anthropic',
      baseUrl: env.ANTHROPIC_BASE_URL,
      defaultModel: env.ANTHROPIC_MODEL,
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }
  if (env.GEMINI_API_KEY) {
    entries.push({
      id: 'gemini',
      type: 'gemini',
      baseUrl: env.GEMINI_BASE_URL,
      defaultModel: env.GEMINI_MODEL,
      apiKey: env.GEMINI_API_KEY,
    });
  }
  entries.push({
    id: 'ollama',
    type: 'ollama',
    baseUrl: env.OLLAMA_BASE_URL,
    defaultModel: env.OLLAMA_MODEL,
  });
  return entries;
}

export function parseProviderConfig(raw: unknown): ProviderConfigEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !entry.id) return [];
    if (typeof entry.type !== 'string') return [];
    const type = entry.type as ProviderType;
    if (!['openai', 'anthropic', 'gemini', 'ollama', 'openai-compatible'].includes(type)) return [];
    return [{
      id: entry.id,
      type,
      ...(typeof entry.name === 'string' ? {name: entry.name} : {}),
      ...(typeof entry.baseUrl === 'string' ? {baseUrl: entry.baseUrl} : {}),
      ...(typeof entry.defaultModel === 'string' ? {defaultModel: entry.defaultModel} : {}),
      ...(typeof entry.apiKey === 'string' ? {apiKey: entry.apiKey} : {}),
      ...(typeof entry.apiKeyEnv === 'string' ? {apiKeyEnv: entry.apiKeyEnv} : {}),
      ...(entry.headers && typeof entry.headers === 'object'
        ? {headers: entry.headers as Record<string, string>}
        : {}),
      ...(entry.capabilities && typeof entry.capabilities === 'object'
        ? {capabilities: entry.capabilities as Partial<ProviderCapabilities>}
        : {}),
    }];
  });
}

export function configuredEntries(env: NodeJS.ProcessEnv = process.env): ProviderConfigEntry[] {
  if (env.CODEVIDEO_PROVIDERS_JSON) {
    try {
      return parseProviderConfig(JSON.parse(env.CODEVIDEO_PROVIDERS_JSON));
    } catch {
      return [];
    }
  }
  return legacyEntries(env);
}

function configuredModel(entry: ProviderConfigEntry): string {
  if (entry.defaultModel) return entry.defaultModel;
  if (entry.type === 'anthropic') return 'claude-3-5-haiku-latest';
  if (entry.type === 'gemini') return 'gemini-2.0-flash';
  if (entry.type === 'ollama') return 'llama3.2';
  return 'gpt-4o-mini';
}

export function createGatewayFromConfig(env: NodeJS.ProcessEnv = process.env): AiGateway {
  const gateway = new AiGateway();
  for (const entry of configuredEntries(env)) {
    gateway.register(createProvider(entry, env));
  }
  return gateway;
}

export function createModelManagerFromGateway(gateway: AiGateway, env: NodeJS.ProcessEnv = process.env): ModelManager {
  const roles = loadModelRolesFromEnv(env);
  const entries = configuredEntries(env);
  const first = entries[0];
  const coding = roles.coding ?? (first ? {providerId: first.id, model: configuredModel(first)} : undefined);
  const planning = roles.planning ?? coding;
  const quickCorrection = roles.quickCorrection ?? coding;
  const visionEntry = entries.find(entry => entry.capabilities?.vision) ?? first;
  const vision = roles.vision ?? (visionEntry
    ? {providerId: visionEntry.id, model: configuredModel(visionEntry)}
    : coding);
  return new ModelManager(gateway, {
    roles: {
      ...(coding ? {coding} : {}),
      ...(planning ? {planning} : {}),
      ...(quickCorrection ? {quickCorrection} : {}),
      ...(vision ? {vision} : {}),
    },
  });
}
