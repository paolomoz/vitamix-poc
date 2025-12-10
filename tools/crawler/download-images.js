#!/usr/bin/env node
/**
 * Download Images Script
 * Downloads product images from vitamix.com and stores them locally
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, '../../content');
const IMAGES_DIR = path.join(CONTENT_DIR, 'images/products');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const DELAY_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadImage(url, destPath) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      console.log(`    Failed: ${response.status}`);
      return false;
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

async function downloadProductImages() {
  console.log('Downloading product images...\n');

  // Read products.json
  const productsPath = path.join(CONTENT_DIR, 'products/products.json');
  const productsData = JSON.parse(await fs.readFile(productsPath, 'utf8'));

  const manifest = {
    generatedAt: new Date().toISOString(),
    products: {},
  };

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const product of productsData.products) {
    console.log(`\n[${product.id}] ${product.name}`);
    const productDir = path.join(IMAGES_DIR, product.id);
    await fs.mkdir(productDir, { recursive: true });

    manifest.products[product.id] = {
      primary: null,
      gallery: [],
    };

    // Download primary image
    if (product.images?.primary) {
      const ext = getExtension(product.images.primary);
      const filename = `primary${ext}`;
      const destPath = path.join(productDir, filename);

      try {
        await fs.access(destPath);
        console.log(`  primary: skipped (exists)`);
        manifest.products[product.id].primary = `/content/images/products/${product.id}/${filename}`;
        totalSkipped++;
      } catch {
        console.log(`  primary: downloading...`);
        const success = await downloadImage(product.images.primary, destPath);
        if (success) {
          manifest.products[product.id].primary = `/content/images/products/${product.id}/${filename}`;
          totalDownloaded++;
        } else {
          totalFailed++;
        }
        await sleep(DELAY_MS);
      }
    }

    // Download gallery images
    if (product.images?.gallery?.length) {
      for (let i = 0; i < product.images.gallery.length; i++) {
        const url = product.images.gallery[i];
        // Skip warranty badges and duplicates
        if (url.includes('warranty') || url === product.images.primary) {
          continue;
        }

        const ext = getExtension(url);
        const filename = `gallery-${i}${ext}`;
        const destPath = path.join(productDir, filename);

        try {
          await fs.access(destPath);
          console.log(`  gallery-${i}: skipped (exists)`);
          manifest.products[product.id].gallery.push(`/content/images/products/${product.id}/${filename}`);
          totalSkipped++;
        } catch {
          console.log(`  gallery-${i}: downloading...`);
          const success = await downloadImage(url, destPath);
          if (success) {
            manifest.products[product.id].gallery.push(`/content/images/products/${product.id}/${filename}`);
            totalDownloaded++;
          } else {
            totalFailed++;
          }
          await sleep(DELAY_MS);
        }
      }
    }
  }

  // Save manifest
  const manifestPath = path.join(CONTENT_DIR, 'manifests/images-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n\nSummary:`);
  console.log(`  Downloaded: ${totalDownloaded}`);
  console.log(`  Skipped: ${totalSkipped}`);
  console.log(`  Failed: ${totalFailed}`);
  console.log(`\nManifest saved to: ${manifestPath}`);
}

function getExtension(url) {
  const match = url.match(/\.(png|jpg|jpeg|webp|gif)/i);
  return match ? `.${match[1].toLowerCase()}` : '.png';
}

downloadProductImages().catch(console.error);
