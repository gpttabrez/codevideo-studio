import type {Project} from '@codevideo/project-schema';

export interface RenderLimits {
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  maxFps: number;
  maxScenes: number;
  maxFrames: number;
  maxSceneDurationSeconds: number;
  maxElementsPerScene: number;
  maxCharacters: number;
  maxAssets: number;
  maxAudioClips: number;
  maxSubtitles: number;
  maxSourceBytes: number;
  maxAssetBytes: number;
  maxAudioDurationSeconds: number;
  maxConcurrentPerOwner: number;
  maxQueuedPerOwner: number;
  maxQueuedGlobal: number;
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function getLimits(): RenderLimits {
  return {
    maxWidth: numberEnv('RENDER_MAX_WIDTH', 1920),
    maxHeight: numberEnv('RENDER_MAX_HEIGHT', 1080),
    maxPixels: numberEnv('RENDER_MAX_PIXELS', 2_073_600),
    maxFps: numberEnv('RENDER_MAX_FPS', 30),
    maxScenes: numberEnv('RENDER_MAX_SCENES', 20),
    maxFrames: numberEnv('RENDER_MAX_FRAMES', 18_000),
    maxSceneDurationSeconds: numberEnv('RENDER_MAX_SCENE_DURATION_SECONDS', 60),
    maxElementsPerScene: numberEnv('RENDER_MAX_ELEMENTS_PER_SCENE', 200),
    maxCharacters: numberEnv('RENDER_MAX_CHARACTERS', 20),
    maxAssets: numberEnv('RENDER_MAX_ASSETS', 50),
    maxAudioClips: numberEnv('RENDER_MAX_AUDIO_CLIPS', 20),
    maxSubtitles: numberEnv('RENDER_MAX_SUBTITLES', 500),
    maxSourceBytes: numberEnv('RENDER_MAX_SOURCE_BYTES', 200_000),
    maxAssetBytes: numberEnv('RENDER_MAX_ASSET_BYTES', 25_000_000),
    maxAudioDurationSeconds: numberEnv('RENDER_MAX_AUDIO_DURATION_SECONDS', 600),
    maxConcurrentPerOwner: numberEnv('RENDER_MAX_CONCURRENT_PER_OWNER', 2),
    maxQueuedPerOwner: numberEnv('RENDER_MAX_QUEUED_PER_OWNER', 5),
    maxQueuedGlobal: numberEnv('RENDER_MAX_QUEUED_GLOBAL', 50),
  };
}

export function validateProjectLimits(project: Project, limits: RenderLimits): string | null {
  const {width, height, fps} = project.settings;
  if (width > limits.maxWidth || height > limits.maxHeight) {
    return 'Project resolution exceeds the configured limit.';
  }
  if (width * height > limits.maxPixels) {
    return 'Project pixel count exceeds the configured limit.';
  }
  if (fps > limits.maxFps) {
    return 'Project frame rate exceeds the configured limit.';
  }
  if (project.scenes.length === 0 || project.scenes.length > limits.maxScenes) {
    return 'Project scene count is outside the configured limit.';
  }
  const totalFrames = Math.round(
    project.scenes.reduce((sum, scene) => sum + scene.duration, 0) * fps,
  );
  if (!Number.isFinite(totalFrames) || totalFrames <= 0 || totalFrames > limits.maxFrames) {
    return 'Project frame count is outside the configured limit.';
  }
  if (project.scenes.some(scene => scene.duration > limits.maxSceneDurationSeconds)) {
    return 'A scene duration exceeds the configured limit.';
  }
  if (project.scenes.some(scene => scene.elements.length > limits.maxElementsPerScene)) {
    return 'A scene contains too many elements.';
  }
  if (project.scenes.some(scene => Buffer.byteLength(scene.source, 'utf8') > limits.maxSourceBytes)) {
    return 'Scene source exceeds the configured size limit.';
  }
  if (project.characters.length > limits.maxCharacters) {
    return 'Project contains too many characters.';
  }
  if (project.assets.length > limits.maxAssets) {
    return 'Project contains too many assets.';
  }
  if (project.assets.some(asset => asset.size > limits.maxAssetBytes)) {
    return 'An asset exceeds the configured size limit.';
  }
  if (project.audio.length > limits.maxAudioClips) {
    return 'Project contains too many audio clips.';
  }
  if (project.audio.some(clip => clip.duration > limits.maxAudioDurationSeconds)) {
    return 'An audio clip exceeds the configured duration limit.';
  }
  if (project.subtitles.length > limits.maxSubtitles) {
    return 'Project contains too many subtitles.';
  }
  return null;
}
