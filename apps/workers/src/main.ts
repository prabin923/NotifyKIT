import { WorkerRuntime } from './worker-runtime';

const runtime = new WorkerRuntime();
let shuttingDown = false;

async function bootstrap(): Promise<void> {
  await runtime.start();
}

const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await runtime.stop();
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ message: 'Notification workers failed during shutdown', error: error instanceof Error ? error.message : String(error) }));
    process.exit(1);
  }
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

void bootstrap().catch((error: unknown) => {
  console.error(JSON.stringify({ message: 'Notification workers failed to start', error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
