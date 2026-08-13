import { WorkerRuntime } from './worker-runtime';

const runtime = new WorkerRuntime();
void runtime.start();

const shutdown = async (): Promise<void> => {
  await runtime.stop();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
