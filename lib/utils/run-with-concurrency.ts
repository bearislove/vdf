export async function runWithConcurrency(
  tasks: ReadonlyArray<() => Promise<void>>,
  concurrency: number
): Promise<void> {
  if (tasks.length === 0) return;

  let nextTaskIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), tasks.length);
  const runWorker = async () => {
    while (nextTaskIndex < tasks.length) {
      const task = tasks[nextTaskIndex++];
      await task();
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
}
