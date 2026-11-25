import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {loadEnv} from 'vite';
import {defineConfig} from 'vitest/config';

const root = fileURLToPath(new URL('../..', import.meta.url));

const packageAliases = [
  'shared',
  'project-schema',
  'animation-engine',
  'character-engine',
  'scene-runtime',
  'audio-engine',
  'timeline-engine',
  'ai-gateway',
  'provider-openai',
  'provider-anthropic',
  'provider-gemini',
  'provider-ollama',
];

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, root, '');
  const proxyHeaders = {
    'x-codevideo-proxy-secret': env.CODEVIDEO_PROXY_SECRET ?? process.env.CODEVIDEO_PROXY_SECRET ?? '',
    'x-codevideo-user': env.CODEVIDEO_DEV_USER ?? process.env.CODEVIDEO_DEV_USER ?? 'local',
  };
  const target = env.API_PROXY_TARGET ?? process.env.API_PROXY_TARGET ?? 'http://localhost:3001';
  const proxy = {
    '/api': {target, changeOrigin: true, headers: proxyHeaders},
    '/outputs': {target, changeOrigin: true, headers: proxyHeaders},
  };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        {
          find: '@codevideo/animation-engine/validation',
          replacement: `${root}/packages/animation-engine/src/validation.ts`,
        },
        ...packageAliases.map(name => ({
          find: `@codevideo/${name}`,
          replacement: `${root}/packages/${name}/src/index.ts`,
        })),
      ],
    },
    server: {
      port: 5173,
      proxy,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
