export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  multimodalMessages?: ModelMessage[];
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  text: string;
  model: string;
  usage?: TokenUsage;
  raw?: unknown;
}

export interface ConnectionTest {
  ok: boolean;
  message: string;
  models: string[];
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  listModels(signal?: AbortSignal): Promise<string[]>;
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<string>;
  testConnection(): Promise<ConnectionTest>;
  readonly capabilities?: ProviderCapabilities;
  chatWithMessages?(request: {
    messages: ModelMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    tools?: ToolDefinition[];
    signal?: AbortSignal;
  }): Promise<ChatResponse>;
  probeCapabilities?(model: string, signal?: AbortSignal): Promise<ProviderCapabilities>;
}

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface UsageRecord extends TokenUsage {
  providerId: string;
  model: string;
  timestamp: string;
}

export interface ImagePart {
  type: 'image';
  data: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface ModelMessage {
  role: ChatRole | 'tool';
  content?: string;
  images?: ImagePart[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ToolCallingCapability = 'native' | 'json-protocol' | false;

export interface ProviderCapabilities {
  text: boolean;
  streaming: boolean;
  jsonMode: boolean;
  toolCalling: ToolCallingCapability;
  vision: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

export interface ModelCapabilityReport extends ProviderCapabilities {
  providerId: string;
  model: string;
  checkedAt: string;
  ok: boolean;
  message: string;
}

export type ModelRole = 'planning' | 'coding' | 'vision' | 'quickCorrection';

export interface ModelRef {
  providerId: string;
  model: string;
  fallback?: ModelRef[];
}

export type ModelRoleConfig = Record<ModelRole, ModelRef>;

export interface ModelDescriptor {
  providerId: string;
  providerName: string;
  model: string;
  capabilities?: ProviderCapabilities;
}

export interface CapabilityRequirements {
  vision?: boolean;
  toolCalling?: ToolCallingCapability;
  jsonMode?: boolean;
  streaming?: boolean;
}
