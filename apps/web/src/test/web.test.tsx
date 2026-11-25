import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import App from '../App.js';
import {useStudioStore} from '../store/projectStore.js';

vi.mock('@codevideo/animation-engine', () => ({
  AnimationPreview: class {
    options: {onFrame?: (frame: number, seconds: number) => void};
    constructor(options: {onFrame?: (frame: number, seconds: number) => void}) {
      this.options = options;
    }
    load() {
      this.options.onFrame?.(0, 0);
    }
    play() {}
    pause() {}
    toggle() {}
    restart() {}
    seekFrame() {}
    seekSeconds() {}
    setSpeed() {}
    dispose() {}
    get frame() {
      return 0;
    }
  },
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (value: string) => void;
  }) => (
    <textarea
      aria-label="Animation source"
      value={value}
      onChange={event => onChange?.(event.target.value)}
    />
  ),
  loader: {config: () => undefined},
}));

vi.mock('monaco-editor', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({default: class {}}));
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({default: class {}}));

const initialState = useStudioStore.getState();

beforeEach(() => {
  window.location.hash = '#/';
  localStorage.clear();
  useStudioStore.setState({
    projects: structuredClone(initialState.projects),
    activeProjectId: null,
    selectedSceneId: null,
  });
});

describe('CodeVideo Studio', () => {
  it('renders the dashboard and creates a project', async () => {
    render(<App />);
    expect(screen.getByText('Your studio')).toBeInTheDocument();
    expect(screen.getByText('Welcome to CodeVideo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: /new project/i}));
    const dialog = await screen.findByRole('dialog');
    const nameInput = dialog.querySelector('input') as HTMLInputElement;
    fireEvent.change(nameInput, {target: {value: 'Explainer video'}});
    fireEvent.click(within(dialog).getByRole('button', {name: 'Create'}));

    await waitFor(() =>
      expect(screen.getByText('Explainer video')).toBeInTheDocument(),
    );
  });

  it('filters projects by search', () => {
    render(<App />);
    const search = screen.getByLabelText('Search projects');
    fireEvent.change(search, {target: {value: 'welcome'}});
    expect(screen.getByText('Welcome to CodeVideo')).toBeInTheDocument();
    fireEvent.change(search, {target: {value: 'nothing matches'}});
    expect(screen.queryByText('Welcome to CodeVideo')).not.toBeInTheDocument();
    expect(screen.getByText('No projects found')).toBeInTheDocument();
  });

  it('renders the editor with preview, code, timeline and inspector', async () => {
    const project = useStudioStore.getState().projects[0]!;
    window.location.hash = `#/editor/${project.id}`;
    render(<App />);

    expect(await screen.findByTestId('editor')).toBeInTheDocument();
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument();
    expect(screen.getByTestId('code-panel')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-panel')).toBeInTheDocument();
    expect(screen.getByTestId('inspector')).toBeInTheDocument();
    expect(screen.getByLabelText('Animation source')).toHaveValue(project.scenes[0]!.source);
  });

  it('edits scene source from the code panel', async () => {
    const project = useStudioStore.getState().projects[0]!;
    window.location.hash = `#/editor/${project.id}`;
    render(<App />);
    const editor = await screen.findByTestId('editor');
    const source = screen.getByLabelText('Animation source');
    fireEvent.change(source, {target: {value: 'export default makeScene2D(function* (view) {});'}});
    await waitFor(() =>
      expect(
        useStudioStore.getState().projects.find(item => item.id === project.id)?.scenes[0]?.source,
      ).toBe('export default makeScene2D(function* (view) {});'),
    );
    expect(editor).toBeInTheDocument();
  });

  it('adds a scene from the sidebar', async () => {
    const project = useStudioStore.getState().projects[0]!;
    window.location.hash = `#/editor/${project.id}`;
    render(<App />);
    await screen.findByTestId('editor');
    fireEvent.click(screen.getByRole('button', {name: /add/i}));
    await waitFor(() =>
      expect(
        useStudioStore.getState().projects.find(item => item.id === project.id)?.scenes,
      ).toHaveLength(project.scenes.length + 1),
    );
  });
});
