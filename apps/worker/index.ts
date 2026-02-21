import { NativeConnection, Worker } from '@temporalio/worker';
import * as fetchActivities from './activities/fetchGitHubPRDiff';
import * as specialistActivities from './activities/specialists';

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  console.log(`Connecting to Temporal at ${address}...`);

  const connection = await NativeConnection.connect({ address });

  try {
    const worker = await Worker.create({
      connection,
      taskQueue: 'review-fast',
      workflowsPath: require.resolve('./workflows'),
      activities: { ...fetchActivities, ...specialistActivities },
    });

    console.log('Worker started on task queue: review-fast');

    const shutdown = () => {
      console.log('Shutting down worker...');
      worker.shutdown();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
