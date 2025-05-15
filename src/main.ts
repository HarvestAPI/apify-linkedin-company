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
}

// Structure of input is defined in input_schema.json
const input = await Actor.getInput<Input>();
if (!input) throw new Error('Input is missing!');

input.companies = (input.companies || []).filter((q) => q && !!q.trim());
if (!input.companies?.length) {
  console.error('No companies provided!');
  await Actor.exit();
  process.exit(0);
}

const scraper = createHarvestApiScraper({
  concurrency: 6,
});

const promises = input.companies.map((query, index) => {
  return scraper.addJob({
    query: { search: query },
    index,
    total: input.companies.length,
  });
});

await Promise.all(promises).catch((error) => {
  console.error(`Error scraping profiles:`, error);
});
// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit().
await Actor.exit();
