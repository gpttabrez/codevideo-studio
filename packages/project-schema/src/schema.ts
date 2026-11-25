import {z} from 'zod';

export const projectVersion = 1;

export const RenderEngineSchema = z.enum(['python', 'svg']);
export type RenderEngine = z.infer<typeof RenderEngineSchema>;

export const ResolutionPresetSchema = z.enum([
  '1920x1080',
  '1080x1920',
  '1080x1080',
  '1280x720',
]);
export type ResolutionPreset = z.infer<typeof ResolutionPresetSchema>;

export const FrameRateSchema = z.union([
  z.literal(24),
  z.literal(30),
  z.literal(60),
]);
export type FrameRate = z.infer<typeof FrameRateSchema>;

export const TransitionSchema = z.enum(['none', 'fade', 'slide', 'zoom']);
export type SceneTransition = z.infer<typeof TransitionSchema>;

export const CameraPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});
export type CameraPoint = z.infer<typeof CameraPointSchema>;

export const CameraMoveSchema = z.object({
  from: CameraPointSchema,
  to: CameraPointSchema,
  ease: z.enum(['linear', 'easeInOut']).default('linear'),
});
export type CameraMove = z.infer<typeof CameraMoveSchema>;

export const ElementTypeSchema = z.enum([
  'shape',
  'text',
  'character',
  'image',
  'audio',
]);
export type ElementType = z.infer<typeof ElementTypeSchema>;

export const TransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  scaleX: z.number().positive(),
  scaleY: z.number().positive(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
});
export type Transform = z.infer<typeof TransformSchema>;

export const ElementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: ElementTypeSchema,
  parentId: z.string().nullable(),
  transform: TransformSchema,
  visible: z.boolean(),
  locked: z.boolean(),
  props: z.record(z.string(), z.unknown()),
});
export type SceneElement = z.infer<typeof ElementSchema>;

export const SceneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().nonnegative(),
  duration: z.number().positive().max(3600),
  source: z.string().max(200_000),
  background: z.string(),
  transition: TransitionSchema,
  transitionDuration: z.number().min(0).max(10),
  camera: CameraMoveSchema.optional(),
  elements: z.array(ElementSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

export const CharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  expression: z.string().min(1),
  palette: z.record(z.string(), z.string()),
  configuration: z.record(z.string(), z.unknown()),
  svg: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const AssetTypeSchema = z.enum(['image', 'audio', 'font', 'svg', 'video']);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: AssetTypeSchema,
  url: z.string(),
  mimeType: z.string(),
  size: z.number().nonnegative(),
  createdAt: z.string(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const AudioClipSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  src: z.string(),
  startTime: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;

export const SubtitleCueSchema = z.object({
  id: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
});
export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;

export const ClipSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  start: z.number().nonnegative(),
  duration: z.number().positive(),
  color: z.string(),
  refId: z.string().nullable(),
});
export type TimelineClip = z.infer<typeof ClipSchema>;

export const TrackKindSchema = z.enum([
  'scene',
  'visual',
  'character',
  'audio',
  'subtitle',
]);
export type TrackKind = z.infer<typeof TrackKindSchema>;

export const TrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: TrackKindSchema,
  muted: z.boolean(),
  locked: z.boolean(),
  visible: z.boolean(),
  clips: z.array(ClipSchema),
});
export type TimelineTrack = z.infer<typeof TrackSchema>;

export const TimelineSchema = z.object({
  tracks: z.array(TrackSchema),
  playhead: z.number().nonnegative(),
  zoom: z.number().positive(),
});
export type Timeline = z.infer<typeof TimelineSchema>;

export const ProjectSettingsSchema = z.object({
  width: z.number().int().positive().max(7680),
  height: z.number().int().positive().max(4320),
  fps: FrameRateSchema,
  background: z.string(),
  resolutionPreset: ResolutionPresetSchema,
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ProjectMetadataSchema = z.object({
  author: z.string(),
  tags: z.array(z.string()),
  thumbnail: z.string(),
});
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.literal(projectVersion),
  engine: RenderEngineSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: ProjectSettingsSchema,
  scenes: z.array(SceneSchema),
  characters: z.array(CharacterSchema),
  assets: z.array(AssetSchema),
  audio: z.array(AudioClipSchema),
  subtitles: z.array(SubtitleCueSchema),
  timeline: TimelineSchema,
  metadata: ProjectMetadataSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectSummarySchema = ProjectSchema.pick({
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export function parseProject(input: unknown): Project {
  const project = ProjectSchema.parse(input);
  return project.engine ? project : {...project, engine: 'svg'};
}

export function migrateProject(project: Project): Project {
  return project.engine ? project : {...project, engine: 'svg'};
}

export function safeParseProject(input: unknown) {
  return ProjectSchema.safeParse(input);
}

export function serializeProject(project: Project): string {
  return JSON.stringify(ProjectSchema.parse(project), null, 2);
}

export function deserializeProject(input: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch (error) {
    throw new Error(
      `Project file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseProject(raw);
}
