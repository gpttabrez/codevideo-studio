import {INTRO_SOURCE} from '@codevideo/project-schema';
import {describe, expect, it} from 'vitest';
import {validateAnimationSource} from './validation.js';

describe('animation source validation', () => {
  it('accepts the bundled sample animation', () => {
    expect(validateAnimationSource(INTRO_SOURCE).ok).toBe(true);
  });

  it('rejects network and global access', () => {
    const result = validateAnimationSource(
      "export default function* () { yield fetch('https://example.com'); }",
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('fetch');
  });

  it('rejects imports outside the sandbox allowlist', () => {
    const result = validateAnimationSource("import fs from 'node:fs';");
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Unsupported import');
  });

  it('rejects dynamic imports', () => {
    const result = validateAnimationSource(
      "export default async () => { await import('node:fs'); };",
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Dynamic import');
  });

});
