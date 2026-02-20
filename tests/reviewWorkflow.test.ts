import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

describe('reviewWorkflow', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('runs echo activity, sleeps 2s, and completes', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-review',
      workflowsPath: path.resolve(__dirname, '../apps/worker/workflows'),
      activities: {
        echoActivity: async (input: string) => `echo: ${input}`,
      },
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-review',
        workflowId: 'test-review-1',
        args: [{ input: 'hello world' }],
      });

      // Query running state
      const runningState = await handle.query<{ status: string; input: string }>('getReviewState');
      expect(runningState.status).toBe('running');
      expect(runningState.input).toBe('hello world');

      // Wait for completion (time-skipping handles the 2s sleep)
      const result = await handle.result();
      expect(result).toEqual({ status: 'complete', input: 'hello world' });

      // Query final state
      const finalState = await handle.query<{ status: string; input: string }>('getReviewState');
      expect(finalState.status).toBe('complete');
    });
  });

  it('can run multiple sequential workflows', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-review-2',
      workflowsPath: path.resolve(__dirname, '../apps/worker/workflows'),
      activities: {
        echoActivity: async (input: string) => `echo: ${input}`,
      },
    });

    await worker.runUntil(async () => {
      // First workflow
      const handle1 = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-review-2',
        workflowId: 'test-seq-1',
        args: [{ input: 'first' }],
      });
      const result1 = await handle1.result();
      expect(result1.status).toBe('complete');

      // Second workflow
      const handle2 = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-review-2',
        workflowId: 'test-seq-2',
        args: [{ input: 'second' }],
      });
      const result2 = await handle2.result();
      expect(result2.status).toBe('complete');
      expect(result2.input).toBe('second');
    });
  });
});
