import { NativeConnection, Worker } from '@temporalio/worker';
import * as fetchActivities from './activities/fetchGitHubPRDiff';
import * as specialistActivities from './activities/specialists';
import * as mutineerActivities from './activities/mutineer';
import * as arbitratorActivities from './activities/arbitrator';
import * as historyActivities from './activities/history';
import * as synthesisActivities from './activities/synthesis';

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  console.log(`Connecting to Temporal at ${address}...`);

  const connection = await NativeConnection.connect({ address });

  try {
    const fastWorker = await Worker.create({
      connection,
      taskQueue: 'review-fast',
      workflowsPath: require.resolve('./workflows'),
      activities: {
        ...fetchActivities,
        ...specialistActivities,
        ...mutineerActivities,
        ...arbitratorActivities,
        ...historyActivities,
      },
    });

    const deepWorker = await Worker.create({
      connection,
      taskQueue: 'review-deep',
      activities: { ...synthesisActivities },
    });

    console.log('Workers started on task queues: review-fast, review-deep');

    const shutdown = () => {
      console.log('Shutting down workers...');
      fastWorker.shutdown();
      deepWorker.shutdown();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    await Promise.all([fastWorker.run(), deepWorker.run()]);
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
