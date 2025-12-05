// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/).
import { Actor } from 'apify';
import { config } from 'dotenv';
import { createHarvestApiScraper } from './utils/scraper.js';

config();

// this is ESM project, and as such, it requires you to specify extensions in your relative imports
// read more about this here: https://nodejs.org/docs/latest-v18.x/api/esm.html#mandatory-file-extensions
// note that we need to use `.js` even when inside TS files
// import { router } from './routes.js';

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
if (!input.companies?.length) {
  console.error('No companies provided!');
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

const client = Actor.newClient();
const { userId } = Actor.getEnv();
const user = userId ? await client.user(userId).get() : null;
const isPaying = (user as Record<string, any> | null)?.isPaying === false ? false : true;

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
  concurrency: isPaying ? 16 : 6,
});

const promises = [...input.companies, ...input.searches]
  .filter((q) => !state.scrapedItems.includes(q))
  .map((query, index) => {
    return scraper.addJob({
      query: { search: query, location: input.location || '' },
      index,
      total: (input.companies?.length || 0) + (input.searches?.length || 0),
    });
  });

await Promise.all(promises).catch((error) => {
  console.error(`Error scraping profiles:`, error);
});
// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit().
await Actor.exit();
