/**
 * A generic worker pool to process an array of items with a strict concurrency limit.
 * * @param items The array of items to process.
 * @param concurrency The maximum number of concurrent operations.
 * @param processItem The async function to run on each item.
 */
export async function runWorkerPool<T>(
  items: T[],
  concurrency: number,
  processItem: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!items || items.length === 0) return;
  if (concurrency <= 0) throw new Error('Concurrency must be greater than 0');

  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];

      try {
        await processItem(item, index);
      } catch (error) {
        console.error(`[WorkerPool] Error processing item at index ${index}:`, error);
      }
    }
  };

  const actualConcurrency = Math.min(concurrency, items.length);
  const workers = Array.from({ length: actualConcurrency }, () => worker());

  await Promise.all(workers);
}
