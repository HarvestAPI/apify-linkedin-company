import { Actor } from 'apify';
import { throttle } from 'throttle-debounce';

const { actorId, actorRunId, actorBuildId, userId, actorMaxPaidDatasetItems, memoryMbytes } =
  Actor.getEnv();
const isPaying = !!process.env.APIFY_USER_IS_PAYING;

export async function createHarvestApiScraper({ state }: { state: { scrapedItems: string[] } }) {
  let processedCounter = 0;
  let scrapedCounter = 0;
  const cm = Actor.getChargingManager();
  const pricingInfo = cm.getPricingInfo();

  const saveState = throttle(2_000, async () => {
    await Actor.setValue('crawling-state', state);
  });

  return {
    processJob: async ({
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
      const params = new URLSearchParams({ ...query, scrapePeopleTab: 'true' });

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
          'x-apify-user-is-paying': String(isPaying),
          'x-apify-user-is-paying-2': process.env.APIFY_USER_IS_PAYING || '',
          'x-apify-max-total-charge-usd': String(pricingInfo.maxTotalChargeUsd),
          'x-apify-is-pay-per-event': String(pricingInfo.isPayPerEvent),
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
      delete response.query;

      const elapsed = new Date().getTime() - timestamp.getTime();
      processedCounter++;

      if (response.element?.id) {
        scrapedCounter++;
        response.element.originalQuery = response.originalQuery;
        response.element.requestId = response.requestId;
        await Actor.pushData(response.element);

        state.scrapedItems.push(query.search);
        saveState();

        console.info(
          `Scraped item#${index + 1} ${JSON.stringify(query)}. Elapsed: ${elapsed}ms. Progress: ${processedCounter}/${total}`,
        );
      } else {
        if (response?.cost && pricingInfo.isPayPerEvent) {
          await Actor.charge({ eventName: 'company' });
        }

        console.error(
          `Error scraping item#${index + 1} ${JSON.stringify(query)}: ${JSON.stringify(
            typeof response.error === 'object' ? response.error : response,
            null,
            2,
          )}`,
        );
      }
    },
  };
}
