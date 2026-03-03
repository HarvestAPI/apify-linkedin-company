// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/).
import { Actor } from 'apify';
import { config } from 'dotenv';
import { createHarvestApiScraper } from './utils/scraper.js';
import { runWorkerPool } from './utils/worker_pool.js';

config();

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init().
await Actor.init();

interface Input {
  companies?: string[];
  searches?: string[];
  location?: string;
}

// Structure of input is defined in input_schema.json
const input = await Actor.getInput<Input>();
if (!input) throw new Error('Input is missing!');

input.companies = (input.companies || []).filter((q) => q && !!q.trim());
input.searches = (input.searches || []).filter((q) => q && !!q.trim());

if (!input.companies.length && !input.searches.length) {
  console.error(
    'No companies provided to scrape. Please provide at least one LinkedIn company URL or search query.',
  );
  await Actor.exit();
}

for (const company of input.companies) {
  if (!company.includes('linkedin.com/')) {
    const errorMsg = `Invalid LinkedIn company URL provided: "${company}". Please provide full LinkedIn company URLs (e.g., https://www.linkedin.com/company/google).`;
    console.error(errorMsg);
    await Actor.exit({
      statusMessage: errorMsg,
      exitCode: 0,
    });
  }
}

const isPaying = !!process.env.APIFY_USER_IS_PAYING;
const concurrencyLimit = isPaying ? 16 : 6;

const state: {
  scrapedItems: string[];
} = (await Actor.getValue('crawling-state')) || {
  scrapedItems: [],
};

Actor.on('migrating', async () => {
  await Actor.setValue('crawling-state', state);
  await Actor.reboot();
});

const scraper = await createHarvestApiScraper({
  state,
});

const itemsToProcess = [...input.companies, ...input.searches].filter(
  (q) => !state.scrapedItems.includes(q),
);

const totalItems = (input.companies?.length || 0) + (input.searches?.length || 0);

console.info(`Starting worker pool with concurrency: ${concurrencyLimit}`);

await runWorkerPool(itemsToProcess, concurrencyLimit, async (query, index) => {
  await scraper.processJob({
    query: { search: query, location: input.location || '' },
    index,
    total: totalItems,
  });
}).catch((error) => {
  console.error(`Fatal error in worker pool execution:`, error);
});

await Actor.exit();
