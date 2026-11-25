import {createGatewayFromConfig, createModelManagerFromGateway} from '@codevideo/model-config';
import {startWorkerLoop} from './agent.js';

const gateway = createGatewayFromConfig();
const manager = createModelManagerFromGateway(gateway);

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  await startWorkerLoop(manager);
}

export {extractToolCall, runAgentStep, runSession, runWorkerOnce} from './agent.js';
