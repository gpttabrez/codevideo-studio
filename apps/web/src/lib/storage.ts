import {ProjectSchema, type Project} from '@codevideo/project-schema';
import {formatTimecode} from '@codevideo/shared';

export function serializeProject(project: Project): string {
  return JSON.stringify(ProjectSchema.parse(project), null, 2);
}

export function downloadProject(project: Project): void {
  const blob = new Blob([serializeProject(project)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(project.name)}.codevideo.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  return ProjectSchema.parse(JSON.parse(text));
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

export function projectDuration(project: Project): string {
  return formatTimecode(
    project.scenes.reduce((total, scene) => total + scene.duration, 0),
    project.settings.fps,
  );
}

export function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
