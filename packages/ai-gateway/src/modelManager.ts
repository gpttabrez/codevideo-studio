import type {
  AIProvider,
  CapabilityRequirements,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ModelCapabilityReport,
  ModelDescriptor,
  ModelMessage,
  ModelRef,
  ModelRole,
  ModelRoleConfig,
  ProviderCapabilities,
  ToolCallingCapability,
} from './types.js';

export interface ModelManagerOptions {
  roles?: Partial<ModelRoleConfig>;
  capabilityTtlMs?: number;
  probe?: (providerId: string, model: string, signal?: AbortSignal) => Promise<ProviderCapabilities>;
}

interface GatewayLike {
  has(providerId: string): boolean;
  chat(providerId: string, request: ChatRequest): Promise<ChatResponse>;
  getProvider(providerId: string): {
    id: string;
    name: string;
    capabilities?: ProviderCapabilities;
    chat(request: ChatRequest): Promise<ChatResponse>;
    chatWithMessages?(request: {
      messages: ModelMessage[];
      model?: string;
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
      tools?: import('./types.js').ToolDefinition[];
      signal?: AbortSignal;
    }): Promise<ChatResponse>;
    listModels(signal?: AbortSignal): Promise<string[]>;
  };
  listProviders(): Array<{id: string; name: string}>;
}

const ROLES: ModelRole[] = ['planning', 'coding', 'vision', 'quickCorrection'];

const UNSPECIFIED_CAPABILITIES: ProviderCapabilities = {
  text: true,
  streaming: true,
  jsonMode: false,
  toolCalling: false,
  vision: false,
};

export class ModelCapabilityError extends Error {
  constructor(
    message: string,
    readonly reasons: string[] = [],
  ) {
    super(message);
    this.name = 'ModelCapabilityError';
  }
}

function modelKey(providerId: string, model: string): string {
  return `${providerId}:${model}`;
}

function flattenCandidates(ref: ModelRef): ModelRef[] {
  const output: ModelRef[] = [];
  const seen = new Set<string>();
  const visit = (candidate: ModelRef): void => {
    const key = modelKey(candidate.providerId, candidate.model);
    if (seen.has(key)) return;
    seen.add(key);
    output.push(candidate);
    for (const fallback of candidate.fallback ?? []) visit(fallback);
  };
  visit(ref);
  return output;
}

function meetsToolRequirement(
  actual: ToolCallingCapability,
  required: ToolCallingCapability | undefined,
): boolean {
  if (required === undefined || required === false) return true;
  if (required === 'native') return actual === 'native';
  return actual === 'native' || actual === 'json-protocol';
}

function meetsRequirements(
  capabilities: ProviderCapabilities,
  requirements: CapabilityRequirements,
): boolean {
  if (!capabilities.text) return false;
  if (requirements.vision && !capabilities.vision) return false;
  if (requirements.jsonMode && !capabilities.jsonMode) return false;
  if (requirements.streaming && !capabilities.streaming) return false;
  if (!meetsToolRequirement(capabilities.toolCalling, requirements.toolCalling)) return false;
  return true;
}

function describeFailure(
  ref: ModelRef,
  capabilities: ProviderCapabilities | null,
  requirements: CapabilityRequirements,
): string {
  if (!capabilities) return `${modelKey(ref.providerId, ref.model)} is not configured.`;
  const missing: string[] = [];
  if (requirements.vision && !capabilities.vision) missing.push('vision');
  if (requirements.jsonMode && !capabilities.jsonMode) missing.push('json mode');
  if (requirements.streaming && !capabilities.streaming) missing.push('streaming');
  if (!meetsToolRequirement(capabilities.toolCalling, requirements.toolCalling)) {
    missing.push(`tool calling (${requirements.toolCalling})`);
  }
  return missing.length
    ? `${modelKey(ref.providerId, ref.model)} lacks ${missing.join(', ')}.`
    : `${modelKey(ref.providerId, ref.model)} is unavailable.`;
}

function messageToText(message: ModelMessage): string {
  const parts: string[] = [];
  if (message.content) parts.push(message.content);
  if (message.toolCalls?.length) {
    parts.push(`TOOL_CALLS ${JSON.stringify(message.toolCalls)}`);
  }
  if (message.toolResults?.length) {
    parts.push(`TOOL_RESULTS ${JSON.stringify(message.toolResults)}`);
  }
  return parts.join('\n').trim();
}

export class ModelManager {
  private readonly roles: ModelRoleConfig;
  private readonly capabilityTtlMs: number;
  private readonly probe?: ModelManagerOptions['probe'];
  private readonly cache = new Map<string, {report: ModelCapabilityReport; expiresAt: number}>();

  constructor(
    private readonly gateway: GatewayLike,
    options: ModelManagerOptions = {},
  ) {
    this.roles = {
      planning: options.roles?.planning ?? {providerId: '', model: ''},
      coding: options.roles?.coding ?? {providerId: '', model: ''},
      vision: options.roles?.vision ?? {providerId: '', model: ''},
      quickCorrection: options.roles?.quickCorrection ?? {providerId: '', model: ''},
    };
    this.capabilityTtlMs = Math.max(0, options.capabilityTtlMs ?? 300_000);
    this.probe = options.probe;
  }

  getRoleConfig(): ModelRoleConfig {
    return structuredClone(this.roles);
  }

  setRole(role: ModelRole, ref: ModelRef): void {
    this.roles[role] = structuredClone(ref);
  }

  withRoles(roles: Partial<ModelRoleConfig>): ModelManager {
    return new ModelManager(this.gateway, {
      roles: {...this.getRoleConfig(), ...roles},
      capabilityTtlMs: this.capabilityTtlMs,
      probe: this.probe,
    });
  }

  listDescriptors(): ModelDescriptor[] {
    const providers = new Map(this.gateway.listProviders().map(item => [item.id, item.name]));
    return ROLES.flatMap(role => {
      const ref = this.roles[role];
      if (!ref.providerId || !ref.model) return [];
      const cached = this.cache.get(modelKey(ref.providerId, ref.model));
      return [{
        role,
        providerId: ref.providerId,
        providerName: providers.get(ref.providerId) ?? ref.providerId,
        model: ref.model,
        capabilities: cached?.report,
      }];
    });
  }

  async capabilities(providerId: string, model: string, signal?: AbortSignal): Promise<ModelCapabilityReport> {
    const key = modelKey(providerId, model);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.report;

    let capabilities: ProviderCapabilities;
    let ok = true;
    let message = 'Capabilities resolved from provider metadata.';
    try {
      if (this.probe) {
        capabilities = await this.probe(providerId, model, signal);
        message = 'Capabilities verified by probe.';
      } else {
        const provider = this.gateway.getProvider(providerId);
        capabilities = provider.capabilities ?? UNSPECIFIED_CAPABILITIES;
      }
    } catch (error) {
      ok = false;
      capabilities = {...UNSPECIFIED_CAPABILITIES, text: false};
      message = error instanceof Error ? error.message : String(error);
    }

    const report: ModelCapabilityReport = {
      providerId,
      model,
      ...capabilities,
      checkedAt: new Date().toISOString(),
      ok,
      message,
    };
    this.cache.set(key, {report, expiresAt: Date.now() + this.capabilityTtlMs});
    return report;
  }

  async resolve(
    role: ModelRole,
    requirements: CapabilityRequirements = {},
    signal?: AbortSignal,
  ): Promise<{ref: ModelRef; capabilities: ProviderCapabilities}> {
    const ref = this.roles[role];
    if (!ref.providerId || !ref.model) {
      throw new ModelCapabilityError(`No model configured for role ${role}.`);
    }
    const reasons: string[] = [];
    for (const candidate of flattenCandidates(ref)) {
      if (!this.gateway.has(candidate.providerId)) {
        reasons.push(`${modelKey(candidate.providerId, candidate.model)} is not configured.`);
        continue;
      }
      const report = await this.capabilities(candidate.providerId, candidate.model, signal);
      if (!report.ok || !meetsRequirements(report, requirements)) {
        reasons.push(describeFailure(candidate, report, requirements));
        continue;
      }
      return {ref: candidate, capabilities: report};
    }
    throw new ModelCapabilityError(
      `No configured model for role ${role} satisfies the required capabilities.`,
      reasons,
    );
  }

  async chat(
    role: ModelRole,
    request: ChatRequest,
    requirements: CapabilityRequirements = {},
  ): Promise<ChatResponse> {
    const ref = this.roles[role];
    if (!ref.providerId || !ref.model) {
      throw new ModelCapabilityError(`No model configured for role ${role}.`);
    }
    const failures: string[] = [];
    for (const candidate of flattenCandidates(ref)) {
      const report = await this.capabilities(candidate.providerId, candidate.model, request.signal);
      if (!report.ok || !meetsRequirements(report, requirements)) {
        failures.push(describeFailure(candidate, report, requirements));
        continue;
      }
      try {
        const provider = this.gateway.getProvider(candidate.providerId);
        const response = request.multimodalMessages?.length || request.tools?.length
          ? await this.chatStructured(provider, request, candidate.model)
          : await this.gateway.chat(candidate.providerId, {...request, model: candidate.model});
        return {...response, model: response.model || candidate.model, raw: {...(response.raw ?? {}), fallbackUsed: candidate !== ref}};
      } catch (error) {
        if (request.signal?.aborted) throw error;
        failures.push(`${modelKey(candidate.providerId, candidate.model)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new ModelCapabilityError(
      `No configured model for role ${role} satisfies the required capabilities and completed the request.`,
      failures,
    );
  }

  private async chatStructured(
    provider: Pick<AIProvider, 'name' | 'chatWithMessages'>,
    request: ChatRequest,
    model: string,
  ): Promise<ChatResponse> {
    if (!provider.chatWithMessages) {
      throw new Error(`${provider.name} does not support structured messages.`);
    }
    return provider.chatWithMessages({
      messages: request.multimodalMessages ?? toModelMessages(request.messages),
      model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      jsonMode: request.jsonMode,
      tools: request.tools,
      signal: request.signal,
    });
  }
}

function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map(message => ({role: message.role, content: message.content}));
}

export function parseModelRoles(value: unknown): Partial<ModelRoleConfig> {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const output: Partial<ModelRoleConfig> = {};
  for (const role of ROLES) {
    const candidate = raw[role];
    if (isModelRef(candidate)) output[role] = candidate;
  }
  return output;
}

function isModelRef(value: unknown): value is ModelRef {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.providerId !== 'string' || !candidate.providerId) return false;
  if (typeof candidate.model !== 'string' || !candidate.model) return false;
  if (candidate.fallback !== undefined) {
    if (!Array.isArray(candidate.fallback) || !candidate.fallback.every(isModelRef)) return false;
  }
  return true;
}

export function loadModelRolesFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<ModelRoleConfig> {
  const raw = env.CODEVIDEO_MODEL_ROLES_JSON;
  if (!raw) return {};
  try {
    return parseModelRoles(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function toolCapability(value: unknown): ToolCallingCapability {
  return value === 'native' || value === 'json-protocol' ? value : false;
}
