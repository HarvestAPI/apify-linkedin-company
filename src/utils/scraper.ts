import { Actor } from 'apify';
import { createConcurrentQueues } from './queue.js';

const { actorId, actorRunId, actorBuildId, userId, actorMaxPaidDatasetItems, memoryMbytes } =
  Actor.getEnv();

export function createHarvestApiScraper({ concurrency }: { concurrency: number }) {
  let processedCounter = 0;
  let scrapedCounter = 0;

  return {
    addJob: createConcurrentQueues(
      concurrency,
      async ({
        index,
        query,
        total,
      }: {
        query: Record<string, string>;
        index: number;
        total: number;
      }) => {
        if (actorMaxPaidDatasetItems && scrapedCounter >= actorMaxPaidDatasetItems) {
          console.warn(`Max scraped items reached: ${actorMaxPaidDatasetItems}`);
          return;
        }
        const params = new URLSearchParams({ ...query });

        console.info(`Starting item#${index + 1} ${JSON.stringify(query)}...`);
        const timestamp = new Date();
        const path = 'linkedin/company';

        const baseUrl = process.env.HARVESTAPI_URL || 'https://api.harvest-api.com';
        const url = `${baseUrl}/${path}?${params.toString()}`;

        const response = await fetch(url, {
          headers: {
            'X-API-Key': process.env.HARVESTAPI_TOKEN!,
            'x-apify-userid': userId!,
            'x-apify-actor-id': actorId!,
            'x-apify-actor-run-id': actorRunId!,
            'x-apify-actor-build-id': actorBuildId!,
            'x-apify-memory-mbytes': String(memoryMbytes),
            'x-apify-actor-max-paid-dataset-items': String(actorMaxPaidDatasetItems) || '0',
          },
        })
          .then((response) => response.json())
          .catch((error) => {
            console.error(`Error fetching ${path}:`, error);
            return { error };
          });

        delete response.user;
        delete response.credits;
        if (typeof response.error === 'object') {
          delete response.error.user;
          delete response.error.credits;
        }

        const elapsed = new Date().getTime() - timestamp.getTime();
        processedCounter++;

        if (response.element?.id) {
          scrapedCounter++;
          await Actor.pushData(response?.element);

          console.info(
            `Scraped item#${index + 1} ${JSON.stringify(query)}. Elapsed: ${(
              elapsed / 1000
            ).toFixed(2)}s. Progress: ${processedCounter}/${total}`,
          );
        } else {
          console.error(
            `Error scraping item#${index + 1} ${JSON.stringify(query)}: ${JSON.stringify(
              typeof response.error === 'object' ? response.error : response,
              null,
              2,
            )}`,
          );
        }
      },
    ),
  };
}
