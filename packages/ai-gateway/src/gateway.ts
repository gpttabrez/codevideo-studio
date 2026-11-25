import {validateAnimationSource} from '@codevideo/animation-engine/validation';
import {
  createDefaultProject,
  createDefaultSettings,
  INTRO_SOURCE,
} from '@codevideo/project-schema';
import type {Project, ProjectSettings} from '@codevideo/project-schema';
import {estimateTokens, parseJsonText} from './http.js';
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  ConnectionTest,
  UsageRecord,
} from './types.js';

export class AiGateway {
  private readonly providers = new Map<string, AIProvider>();
  private readonly records: UsageRecord[] = [];

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  listProviders(): Array<{id: string; name: string}> {
    return [...this.providers.values()].map(({id, name}) => ({id, name}));
  }

  getProvider(providerId: string): AIProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(
        `AI provider "${providerId}" is not configured. Available: ${
          this.listProviders().map(item => item.id).join(', ') || 'none'
        }`,
      );
    }
    return provider;
  }

  async chat(providerId: string, request: ChatRequest): Promise<ChatResponse> {
    const provider = this.getProvider(providerId);
    const response = await provider.chat(request);
    this.record(providerId, response);
    return response;
  }

  async *stream(
    providerId: string,
    request: ChatRequest,
  ): AsyncIterable<string> {
    const provider = this.getProvider(providerId);
    let text = '';
    for await (const chunk of provider.stream(request)) {
      text += chunk;
      yield chunk;
    }
    this.records.push({
      providerId,
      model: request.model ?? 'default',
      promptTokens: estimateTokens(request.messages.map(m => m.content).join('')),
      completionTokens: estimateTokens(text),
      totalTokens:
        estimateTokens(request.messages.map(m => m.content).join('')) +
        estimateTokens(text),
      timestamp: new Date().toISOString(),
    });
  }

  async generateJson<T>(
    providerId: string,
    request: ChatRequest,
    validate: (value: unknown) => T,
    retries = 1,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const response = await this.chat(providerId, {
        ...request,
        jsonMode: true,
        messages: [
          ...request.messages,
          {
            role: 'user',
            content:
              attempt === 0
                ? 'Respond with a single valid JSON object only.'
                : 'Your previous response was invalid JSON. Return corrected JSON only.',
          },
        ],
      });
      try {
        return validate(parseJsonText(response.text));
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      `Failed to obtain valid JSON from ${providerId}: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  async testConnection(providerId: string): Promise<ConnectionTest> {
    return this.getProvider(providerId).testConnection();
  }

  getUsage(): UsageRecord[] {
    return [...this.records];
  }

  private record(providerId: string, response: ChatResponse): void {
    const promptTokens =
      response.usage?.promptTokens ??
      estimateTokens(`${providerId}:${response.model}`);
    const completionTokens =
      response.usage?.completionTokens ?? estimateTokens(response.text);
    this.records.push({
      providerId,
      model: response.model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      timestamp: new Date().toISOString(),
    });
  }
}

export function validateGeneratedAnimation(code: string) {
  return validateAnimationSource(code);
}

export function extractAnimationCode(text: string): string {
  const match = text.match(/```(?:ts|typescript)?\s*\n([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? text.trim();
}

export function buildLocalStoryboard(
  prompt: string,
  settings: ProjectSettings = createDefaultSettings(),
): Project {
  const project = createDefaultProject('AI storyboard');
  const topic = prompt.trim().slice(0, 120) || 'Your idea comes to life';
  const titleSource = INTRO_SOURCE.replace(
    'text: \'Animate ideas with TypeScript\'',
    `text: ${JSON.stringify(topic)}`,
  );
  const scene = project.scenes[0];
  if (scene) scene.source = titleSource;
  project.description = `Generated locally from prompt: ${prompt}`;
  project.settings = settings;
  return project;
}
