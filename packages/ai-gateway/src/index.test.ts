import {
  AiGateway,
  buildLocalStoryboard,
  extractAnimationCode,
  validateGeneratedAnimation,
} from './index.js';
import type {AIProvider, ChatResponse, ConnectionTest} from './types.js';
import {describe, expect, it} from 'vitest';

class FakeProvider implements AIProvider {
  readonly id = 'fake';
  readonly name = 'Fake';
  async listModels() {
    return ['fake-1'];
  }
  async chat(): Promise<ChatResponse> {
    return {text: '{"scenes":[]}', model: 'fake-1'};
  }
  async *stream() {
    yield 'hello';
    yield ' world';
  }
  async testConnection(): Promise<ConnectionTest> {
    return {ok: true, message: 'Connected', models: ['fake-1']};
  }
}

describe('AI gateway', () => {
  it('registers providers, records usage and validates JSON', async () => {
    const gateway = new AiGateway();
    gateway.register(new FakeProvider());
    expect(gateway.listProviders()).toEqual([{id: 'fake', name: 'Fake'}]);
    const result = await gateway.generateJson<{scenes: unknown[]}>(
      'fake',
      {messages: [{role: 'user', content: 'storyboard'}]},
      value => value as {scenes: unknown[]},
    );
    expect(result.scenes).toEqual([]);
    expect(gateway.getUsage()).toHaveLength(1);
    expect((await gateway.testConnection('fake')).ok).toBe(true);
  });

  it('streams response chunks', async () => {
    const gateway = new AiGateway();
    gateway.register(new FakeProvider());
    const chunks: string[] = [];
    for await (const chunk of gateway.stream('fake', {
      messages: [{role: 'user', content: 'hi'}],
    })) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('hello world');
  });

  it('builds a usable offline storyboard', () => {
    const project = buildLocalStoryboard('A robot learns to paint');
    expect(project.scenes[0]?.source).toContain('A robot learns to paint');
    expect(project.scenes[0]?.source).toContain('makeScene2D');
    expect(validateGeneratedAnimation).toBeTypeOf('function');
  });

  it('extracts fenced animation code', () => {
    expect(extractAnimationCode('intro\n```ts\nexport default 1;\n```')).toBe(
      'export default 1;',
    );
  });
});
