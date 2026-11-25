import {useEffect, useState} from 'react';

export type Route =
  | {name: 'dashboard'}
  | {name: 'editor'; projectId: string}
  | {name: 'render'; jobId: string}
  | {name: 'agent'; projectId?: string};

function parseHash(): Route {
  const editorMatch = window.location.hash.match(/^#\/editor\/([^/]+)/);
  if (editorMatch?.[1]) {
    return {name: 'editor', projectId: decodeURIComponent(editorMatch[1])};
  }
  const renderMatch = window.location.hash.match(/^#\/render\/([^/]+)/);
  if (renderMatch?.[1]) {
    return {name: 'render', jobId: decodeURIComponent(renderMatch[1])};
  }
  const agentMatch = window.location.hash.match(/^#\/agent(?:\/([^/]+))?/);
  if (agentMatch) {
    return agentMatch[1]
      ? {name: 'agent', projectId: decodeURIComponent(agentMatch[1])}
      : {name: 'agent'};
  }
  return {name: 'dashboard'};
}

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = (next: Route) => {
    window.location.hash = routeHref(next);
    setRoute(next);
  };
  return [route, navigate];
}

export function routeHref(route: Route): string {
  if (route.name === 'dashboard') return '#/';
  if (route.name === 'editor') return `#/editor/${route.projectId}`;
  if (route.name === 'render') return `#/render/${route.jobId}`;
  return route.projectId ? `#/agent/${route.projectId}` : '#/agent';
}
