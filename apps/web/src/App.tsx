import {useHashRoute} from './lib/router.js';
import {Dashboard} from './components/dashboard/Dashboard.js';
import {Editor} from './components/editor/Editor.js';
import {RenderPage} from './pages/RenderPage.js';
import {AgentStudio} from './components/agent/AgentStudio.js';

export default function App() {
  const [route, navigate] = useHashRoute();
  if (route.name === 'render') {
    return <RenderPage jobId={route.jobId} />;
  }
  if (route.name === 'agent') {
    return <AgentStudio projectId={route.projectId} />;
  }
  if (route.name === 'editor') {
    return (
      <Editor
        key={route.projectId}
        projectId={route.projectId}
        onBack={() => navigate({name: 'dashboard'})}
      />
    );
  }
  return <Dashboard />;
}
