import { Worker } from "bullmq";
import { connection } from "./env";
import { WorkerDir } from "./lib/worker-dir";
import { WorkerProgressTracker } from "./lib/worker-progress-tracker";
import type { Job } from "bullmq";

type WorkerDefinition = {
  name: string;
  callback: WorkerCallback;
};

export function runWorkers(definitions: WorkerDefinition[]) {
  const workers = definitions.map((definition) => {
    const { name, callback } = definition;
    const processor = createWorkerProcessor(callback);
    return new Worker(name, processor, {
      connection,
      autorun: false,
    });
  });

  const gracefulShutdown = async () => {
    for (const worker of workers) {
      if (!worker.isRunning()) {
        continue;
      }
      await worker.close();
    }
    process.exit(0);
  };

  process
    .on("beforeExit", gracefulShutdown)
    .on("SIGINT", gracefulShutdown)
    .on("SIGTERM", gracefulShutdown);

  workers.forEach((worker) => {
    worker.run();
    console.log(`Started worker "${worker.name}"`);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkerCallback<T = any, R = any> = (params: {
  job: Job<T, R>;
  token: string | undefined;
  dir: WorkerDir;
  progressTracker: WorkerProgressTracker;
}) => Promise<R>;

function createWorkerProcessor<T, R>(callback: WorkerCallback<T, R>) {
  return async (job: Job<T, R>, token?: string) => {
    const dir = new WorkerDir();
    const progressTracker = new WorkerProgressTracker(job);

    try {
      return await callback({ job, token, dir, progressTracker });
    } finally {
      await progressTracker.finish();
      await dir.deleteAll();
    }
  };
}
