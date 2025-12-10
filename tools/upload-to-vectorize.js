#!/usr/bin/env node
/**
 * Upload crawled recipes to Vectorize via the embed-recipes worker
 *
 * Usage:
 *   node upload-to-vectorize.js [--local] [--batch-size=100]
 *
 * Options:
 *   --local       Use local worker (http://localhost:8787)
 *   --batch-size  Number of recipes per request (default: 500)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Worker URLs
const LOCAL_URL = 'http://localhost:8787';
const DEPLOYED_URL = 'https://vitamix-embed-recipes.paolo-moz.workers.dev';

async function main() {
  const args = process.argv.slice(2);
  const useLocal = args.includes('--local');
  const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 500;

  const workerUrl = useLocal ? LOCAL_URL : DEPLOYED_URL;

  console.log('📤 Uploading recipes to Vectorize');
  console.log(`   Worker: ${workerUrl}`);
  console.log(`   Batch size: ${batchSize}`);

  // Load recipes
  const recipesPath = path.join(__dirname, '../content/recipes/recipes.json');
  console.log(`   Loading: ${recipesPath}`);

  try {
    const data = await fs.readFile(recipesPath, 'utf-8');
    const recipesFile = JSON.parse(data);
    const recipes = recipesFile.recipes;

    console.log(`   Total recipes: ${recipes.length}\n`);

    // Upload in batches
    let totalProcessed = 0;
    let totalErrors = 0;

    for (let i = 0; i < recipes.length; i += batchSize) {
      const batch = recipes.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(recipes.length / batchSize);

      console.log(`[${batchNum}/${totalBatches}] Uploading ${batch.length} recipes...`);

      try {
        const response = await fetch(`${workerUrl}/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipes: batch }),
        });

        const result = await response.json();

        if (result.success) {
          totalProcessed += result.processed;
          console.log(`   ✓ Processed: ${result.processed}, Batches: ${result.batches}`);
          if (result.errors?.length) {
            totalErrors += result.errors.length;
            result.errors.forEach(e => console.log(`   ⚠ ${e}`));
          }
        } else {
          console.log(`   ✗ Error: ${result.error}`);
          totalErrors++;
        }
      } catch (error) {
        console.log(`   ✗ Request failed: ${error.message}`);
        totalErrors++;
      }

      // Small delay between batches
      if (i + batchSize < recipes.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log('\n✅ Upload complete!');
    console.log(`   Total processed: ${totalProcessed}`);
    console.log(`   Total errors: ${totalErrors}`);

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('❌ recipes.json not found. Run the crawler first:');
      console.error('   cd tools/crawler && node crawl-with-ai.js --recipes-only');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

main();
