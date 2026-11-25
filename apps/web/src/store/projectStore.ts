import {
  createDefaultScene,
  createDefaultProject,
  EMPTY_SOURCE,
  migrateProject,
  type Character,
  type Project,
} from '@codevideo/project-schema';
import {createCharacterRig} from '@codevideo/character-engine';
import {createId, nowIso} from '@codevideo/shared';
import {syncProject} from '@codevideo/scene-runtime';
import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';

interface StudioState {
  projects: Project[];
  activeProjectId: string | null;
  selectedSceneId: string | null;
  createProject: (name?: string) => Project;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  importProject: (project: Project) => Project;
  openProject: (id: string) => void;
  closeProject: () => void;
  updateProject: (id: string, update: (project: Project) => Project) => void;
  selectScene: (id: string | null) => void;
}

function withSyncedTimeline(project: Project): Project {
  return syncProject(migrateProject(project));
}

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      projects: [withSyncedTimeline(createDefaultProject('Welcome to CodeVideo'))],
      activeProjectId: null,
      selectedSceneId: null,

      createProject: (name = 'Untitled Video') => {
        const project = withSyncedTimeline(createDefaultProject(name));
        set(state => ({
          projects: [project, ...state.projects],
          activeProjectId: project.id,
          selectedSceneId: project.scenes[0]?.id ?? null,
        }));
        return project;
      },

      duplicateProject: id => {
        const source = get().projects.find(project => project.id === id);
        if (!source) return;
        const copy: Project = {
          ...structuredClone(source),
          id: createId('project'),
          name: `${source.name} (copy)`,
          metadata: {...source.metadata},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set(state => ({
          projects: [copy, ...state.projects],
          activeProjectId: copy.id,
          selectedSceneId: copy.scenes[0]?.id ?? null,
        }));
      },

      deleteProject: id => {
        set(state => ({
          projects: state.projects.filter(project => project.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      },

      importProject: project => {
        const imported = withSyncedTimeline(project);
        set(state => ({
          projects: [imported, ...state.projects],
          activeProjectId: imported.id,
          selectedSceneId: imported.scenes[0]?.id ?? null,
        }));
        return imported;
      },

      openProject: id => {
        const project = get().projects.find(item => item.id === id);
        set({
          activeProjectId: id,
          selectedSceneId: project?.scenes[0]?.id ?? null,
        });
      },

      closeProject: () => set({activeProjectId: null, selectedSceneId: null}),

      updateProject: (id, update) => {
        set(state => ({
          projects: state.projects.map(project =>
            project.id === id ? withSyncedTimeline(update(project)) : project,
          ),
        }));
      },

      selectScene: id => set({selectedSceneId: id}),
    }),
    {
      name: 'codevideo-studio-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        selectedSceneId: state.selectedSceneId,
      }),
    },
  ),
);

export function addScene(project: Project): Project {
  const scene = createDefaultScene(
    `Scene ${project.scenes.length + 1}`,
    project.scenes.length,
    EMPTY_SOURCE,
    4,
  );
  return {...project, scenes: [...project.scenes, scene]};
}

export function duplicateScene(project: Project, sceneId: string): Project {
  const index = project.scenes.findIndex(scene => scene.id === sceneId);
  if (index < 0) return project;
  const copy = {
    ...structuredClone(project.scenes[index]!),
    id: createId('scene'),
    name: `${project.scenes[index]!.name} copy`,
  };
  const scenes = [...project.scenes];
  scenes.splice(index + 1, 0, copy);
  return {...project, scenes};
}

export function removeScene(project: Project, sceneId: string): Project {
  if (project.scenes.length <= 1) return project;
  return {...project, scenes: project.scenes.filter(scene => scene.id !== sceneId)};
}

export function moveScene(project: Project, sceneId: string, direction: -1 | 1): Project {
  const index = project.scenes.findIndex(scene => scene.id === sceneId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= project.scenes.length) return project;
  const scenes = [...project.scenes];
  [scenes[index], scenes[next]] = [scenes[next]!, scenes[index]!];
  return {...project, scenes};
}

export function addCharacter(project: Project): {project: Project; character: Character} {
  const now = nowIso();
  const rig = createCharacterRig(`Character ${project.characters.length + 1}`);
  const character: Character = {
    id: rig.id,
    name: rig.name,
    expression: rig.config.expression,
    palette: {...rig.config.palette},
    configuration: {config: rig.config, parts: rig.parts},
    svg: rig.svg,
    createdAt: now,
    updatedAt: now,
  };
  return {project: {...project, characters: [...project.characters, character]}, character};
}
