import type {ModelManager} from '@codevideo/ai-gateway';
import type {Project} from '@codevideo/project-schema';
import {executeTool, type ToolContext} from '@codevideo/tool-runtime';

export interface VisionSuggestion {
  sceneId?: string;
  issue: string;
  fix: string;
  source?: string;
}

export interface VisionReview {
  score: number;
  summary: string;
  suggestions: VisionSuggestion[];
}

export interface VisionLoopResult {
  reviews: VisionReview[];
  iterations: number;
  finalScore: number;
  complete: boolean;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonText);
}

function normalizeReview(value: unknown): VisionReview {
  if (!value || typeof value !== 'object') throw new Error('Vision model did not return JSON.');
  const raw = value as Record<string, unknown>;
  const score = Number(raw.score);
  if (!Number.isFinite(score)) throw new Error('Vision review score is missing.');
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions.flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const suggestion = item as Record<string, unknown>;
        return [{
          ...(typeof suggestion.sceneId === 'string' ? {sceneId: suggestion.sceneId} : {}),
          issue: String(suggestion.issue ?? ''),
          fix: String(suggestion.fix ?? ''),
          ...(typeof suggestion.source === 'string' ? {source: suggestion.source} : {}),
        }];
      })
    : [];
  return {
    score: Math.min(1, Math.max(0, score)),
    summary: String(raw.summary ?? ''),
    suggestions,
  };
}

export async function reviewFrame(
  manager: ModelManager,
  image: {mimeType: string; data: string},
  prompt: string,
): Promise<VisionReview> {
  const response = await manager.chat('vision', {
    messages: [
      {role: 'system', content: 'You are a visual QA reviewer. Return only JSON with score, summary and suggestions.'},
      {role: 'user', content: prompt},
    ],
    multimodalMessages: [
      {role: 'system', content: 'You are a visual QA reviewer. Return only JSON with score, summary and suggestions.'},
      {
        role: 'user',
        content: prompt,
        images: [{
          type: 'image',
          data: image.data,
          mimeType: image.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
        }],
      },
    ],
  }, {vision: true});
  return normalizeReview(extractJson(response.text));
}

export async function runVisionLoop(
  manager: ModelManager,
  context: ToolContext,
  project: Project,
  options: {
    sceneIds?: string[];
    maxIterations?: number;
    threshold?: number;
    prompt?: string;
  } = {},
): Promise<VisionLoopResult> {
  const maxIterations = Math.max(1, options.maxIterations ?? 2);
  const threshold = Math.min(1, Math.max(0, options.threshold ?? 0.85));
  const sceneIds = options.sceneIds ?? project.scenes.map(scene => scene.id);
  const prompt = options.prompt ?? 'Review this rendered frame for layout, readability and visual quality.';
  const reviews: VisionReview[] = [];
  let finalScore = 0;
  let complete = false;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const preview = await executeTool('render_preview', {sceneIds}, context);
    if (!preview.ok) throw new Error(`Preview failed: ${preview.error}`);
    const frame = await executeTool('inspect_frame', {frameIndex: 0}, context);
    if (!frame.ok) throw new Error(`Frame inspection failed: ${frame.error}`);
    const image = frame.output as {mimeType: string; data: string};
    const review = await reviewFrame(manager, image, prompt);
    reviews.push(review);
    finalScore = review.score;
    if (review.score >= threshold) {
      complete = true;
      break;
    }
    for (const suggestion of review.suggestions) {
      if (!suggestion.sceneId || !suggestion.source) continue;
      const applied = await executeTool('update_scene', {
        sceneId: suggestion.sceneId,
        patch: {source: suggestion.source},
      }, context);
      if (!applied.ok) throw new Error(`Feedback application failed: ${applied.error}`);
    }
  }
  return {reviews, iterations: reviews.length, finalScore, complete};
}
