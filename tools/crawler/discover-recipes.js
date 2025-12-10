#!/usr/bin/env node
/**
 * Discover all recipe URLs from vitamix.com
 */

import fetch from 'node-fetch';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

async function discoverRecipes() {
  console.log('Fetching recipes page...\n');

  const response = await fetch('https://www.vitamix.com/us/en_us/recipes', {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
    }
  });

  const html = await response.text();

  // Extract recipe URLs from the HTML
  const recipeUrlMatches = [...html.matchAll(/href="([^"]*\/recipes\/[a-z0-9-]+)"/g)];
  const recipeUrls = recipeUrlMatches
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)
    .filter(url => !url.includes('?'))
    .filter(url => {
      const slug = url.split('/').pop();
      return slug && slug.length > 0 && !['recipes'].includes(slug);
    })
    .map(url => url.startsWith('http') ? url : `https://www.vitamix.com${url}`);

  console.log(`Found ${recipeUrls.length} recipe URLs:\n`);
  recipeUrls.forEach(url => console.log(url));

  // Also try to find category links
  const categoryMatches = [...html.matchAll(/href="([^"]*\/recipes[^"]*)"[^>]*>([^<]+)</g)];
  const categories = categoryMatches
    .map(m => ({ url: m[1], name: m[2].trim() }))
    .filter((v, i, a) => a.findIndex(x => x.url === v.url) === i);

  console.log('\n--- Categories/Filters found: ---\n');
  categories.forEach(c => console.log(`${c.name}: ${c.url}`));

  return recipeUrls;
}

discoverRecipes().catch(console.error);
