#!/usr/bin/env node
/**
 * Vitamix Content Crawler
 *
 * Fetches all products and recipes from vitamix.com and saves them locally.
 *
 * Usage:
 *   node crawl.js              # Crawl everything
 *   node crawl.js --products-only
 *   node crawl.js --recipes-only
 *   node crawl.js --images-only
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, '../../content');

const BASE_URL = 'https://www.vitamix.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; VitamixContentBot/1.0)';

// Rate limiting
const DELAY_MS = 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// Fetch Utilities
// ============================================

async function fetchPage(url) {
  console.log(`  Fetching: ${url}`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function fetchJSON(url) {
  console.log(`  Fetching JSON: ${url}`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function downloadImage(url, destPath) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      console.log(`    Failed to download image: ${url}`);
      return false;
    }

    const buffer = await response.arrayBuffer();
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.log(`    Error downloading image: ${error.message}`);
    return false;
  }
}

// ============================================
// Product Crawler
// ============================================

async function crawlProductListPage(pageNum = 1) {
  const url = `${BASE_URL}/us/en_us/shop/blenders?page=${pageNum}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const products = [];

  // Find product tiles
  $('.product-tile, [data-product-id]').each((i, el) => {
    const $el = $(el);
    const link = $el.find('a[href*="/shop/blenders/"]').first();
    const href = link.attr('href');

    if (href && !href.includes('?')) {
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const id = href.split('/').pop();

      products.push({
        id,
        url: fullUrl,
        listingName: $el.find('.product-name, h3, h4').first().text().trim(),
        listingPrice: $el.find('.price, .product-price').first().text().trim(),
      });
    }
  });

  // Check if there's a next page
  const hasNextPage = $('a[rel="next"], .pagination .next').length > 0;

  return { products, hasNextPage };
}

async function crawlProductDetail(url) {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const id = url.split('/').pop();

  // Extract basic info
  const name = $('h1.product-name, h1').first().text().trim();
  const price = parseFloat(
    $('.price-sales, .product-price')
      .first()
      .text()
      .replace(/[^0-9.]/g, '')
  );
  const originalPrice = parseFloat(
    $('.price-standard, .was-price')
      .first()
      .text()
      .replace(/[^0-9.]/g, '')
  );

  // Extract description
  const description = $('.product-description, .pdp-description')
    .first()
    .text()
    .trim();

  // Extract features
  const features = [];
  $('.product-features li, .features-list li, [class*="feature"] li').each(
    (i, el) => {
      const text = $(el).text().trim();
      if (text) features.push(text);
    }
  );

  // Extract specs from table
  const specs = {};
  $('table.specs-table tr, .specifications tr, .product-specs tr').each(
    (i, el) => {
      const label = $(el).find('th, td:first-child').text().trim().toLowerCase();
      const value = $(el).find('td:last-child, td:nth-child(2)').text().trim();
      if (label && value) {
        if (label.includes('watt') || label.includes('power')) {
          specs.watts = parseInt(value.replace(/[^0-9]/g, ''));
        } else if (label.includes('capacity')) {
          specs.capacity = value;
        } else if (label.includes('program')) {
          specs.programs = parseInt(value.replace(/[^0-9]/g, ''));
        } else if (label.includes('warranty')) {
          specs.warranty = value;
        } else if (label.includes('dimension')) {
          specs.dimensions = value;
        } else if (label.includes('weight')) {
          specs.weight = value;
        }
      }
    }
  );

  // Extract images
  const images = [];
  $('img[src*="media"], .product-image img, .gallery-image img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && !images.includes(src)) {
      images.push(src.startsWith('http') ? src : `${BASE_URL}${src}`);
    }
  });

  // Extract series from breadcrumb or URL
  let series = 'other';
  if (url.includes('ascent')) series = 'ascent';
  else if (url.includes('5200')) series = '5200';
  else if (url.includes('e310') || url.includes('explorian')) series = 'explorian';
  else if (url.includes('a2500') || url.includes('a3500')) series = 'legacy';

  // Extract "best for" use cases
  const bestFor = [];
  const programsList = [
    'smoothies',
    'soups',
    'frozen desserts',
    'nut butters',
    'dips',
    'spreads',
    'cocktails',
  ];
  const pageText = $('body').text().toLowerCase();
  programsList.forEach((program) => {
    if (pageText.includes(program)) {
      bestFor.push(program);
    }
  });

  return {
    id,
    sku: id.toUpperCase(),
    name,
    series,
    url,
    price: price || 0,
    originalPrice: originalPrice || null,
    availability: 'in-stock',
    description,
    tagline: description.split('.')[0] || '',
    features,
    bestFor,
    warranty: specs.warranty || '10-year warranty',
    specs: {
      watts: specs.watts || 1500,
      capacity: specs.capacity || '48 oz',
      programs: specs.programs || 0,
      dimensions: specs.dimensions,
      weight: specs.weight,
    },
    images: {
      primary: images[0] || '',
      gallery: images.slice(1),
      remoteUrls: images,
    },
    crawledAt: new Date().toISOString(),
    sourceUrl: url,
    contentHash: '',
  };
}

async function crawlAllProducts() {
  console.log('\n📦 Crawling Products...\n');

  const allProducts = [];
  const seenUrls = new Set();

  // Crawl listing pages
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 5) {
    console.log(`\nPage ${page}:`);
    const { products, hasNextPage } = await crawlProductListPage(page);

    for (const p of products) {
      if (!seenUrls.has(p.url)) {
        seenUrls.add(p.url);
        allProducts.push(p);
      }
    }

    hasMore = hasNextPage;
    page++;
    await sleep(DELAY_MS);
  }

  console.log(`\nFound ${allProducts.length} unique products\n`);

  // Crawl each product detail page
  const detailedProducts = [];

  for (let i = 0; i < allProducts.length; i++) {
    const p = allProducts[i];
    console.log(`[${i + 1}/${allProducts.length}] ${p.listingName}`);

    try {
      const details = await crawlProductDetail(p.url);
      detailedProducts.push(details);
    } catch (error) {
      console.log(`  Error: ${error.message}`);
      // Use listing data as fallback
      detailedProducts.push({
        id: p.id,
        sku: p.id.toUpperCase(),
        name: p.listingName,
        series: 'other',
        url: p.url,
        price: parseFloat(p.listingPrice.replace(/[^0-9.]/g, '')) || 0,
        originalPrice: null,
        availability: 'in-stock',
        description: '',
        tagline: '',
        features: [],
        bestFor: [],
        warranty: '10-year warranty',
        specs: { watts: 1500, capacity: '48 oz', programs: 0 },
        images: { primary: '', gallery: [], remoteUrls: [] },
        crawledAt: new Date().toISOString(),
        sourceUrl: p.url,
        contentHash: '',
      });
    }

    await sleep(DELAY_MS);
  }

  // Save products
  const productsFile = {
    generatedAt: new Date().toISOString(),
    source: 'https://www.vitamix.com',
    count: detailedProducts.length,
    products: detailedProducts,
  };

  await fs.writeFile(
    path.join(CONTENT_DIR, 'products/products.json'),
    JSON.stringify(productsFile, null, 2)
  );

  console.log(`\n✅ Saved ${detailedProducts.length} products\n`);
  return detailedProducts;
}

// ============================================
// Recipe Crawler
// ============================================

async function crawlRecipeListPage(category = '', pageNum = 1) {
  const url = category
    ? `${BASE_URL}/us/en_us/recipes/${category}?page=${pageNum}`
    : `${BASE_URL}/us/en_us/recipes?page=${pageNum}`;

  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const recipes = [];

  // Find recipe tiles
  $('.recipe-tile, [data-recipe-id], .recipe-card').each((i, el) => {
    const $el = $(el);
    const link = $el.find('a[href*="/recipes/"]').first();
    const href = link.attr('href');

    if (href && !href.includes('?')) {
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const id = href.split('/').pop();

      recipes.push({
        id,
        url: fullUrl,
        listingName: $el.find('.recipe-name, h3, h4').first().text().trim(),
        listingCategory: category || 'general',
      });
    }
  });

  const hasNextPage = $('a[rel="next"], .pagination .next').length > 0;

  return { recipes, hasNextPage };
}

async function crawlRecipeDetail(url) {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const id = url.split('/').pop();

  // Extract basic info
  const name = $('h1.recipe-name, h1').first().text().trim();
  const description = $('.recipe-description, .description').first().text().trim();

  // Extract category from breadcrumb or page
  const category =
    $('.breadcrumb a')
      .filter((i, el) => $(el).attr('href')?.includes('/recipes/'))
      .last()
      .text()
      .trim() || 'general';

  // Extract times
  const prepTime =
    $('[class*="prep-time"], .prep-time').first().text().trim() || '';
  const blendTime =
    $('[class*="blend-time"], .blend-time').first().text().trim() || '';
  const totalTime =
    $('[class*="total-time"], .total-time').first().text().trim() || prepTime;

  // Extract servings
  const servingsText = $('[class*="servings"], .servings').first().text();
  const servings = parseInt(servingsText.replace(/[^0-9]/g, '')) || 4;

  // Extract ingredients
  const ingredients = [];
  $('.ingredients li, .ingredient-list li, [class*="ingredient"] li').each(
    (i, el) => {
      const text = $(el).text().trim();
      if (text) {
        ingredients.push({
          item: text,
          quantity: '',
          unit: '',
        });
      }
    }
  );

  // Extract instructions
  const instructions = [];
  $('.instructions li, .directions li, .steps li, [class*="step"]').each(
    (i, el) => {
      const text = $(el).text().trim();
      if (text) instructions.push(text);
    }
  );

  // Extract tips
  const tips = [];
  $('.tips li, .recipe-tips li').each((i, el) => {
    tips.push($(el).text().trim());
  });

  // Extract image
  const imageEl = $('.recipe-image img, .hero-image img').first();
  const primaryImage = imageEl.attr('src') || imageEl.attr('data-src') || '';

  // Determine required container
  let requiredContainer = '64 oz';
  const pageText = $('body').text().toLowerCase();
  if (pageText.includes('48') || pageText.includes('48-oz')) {
    requiredContainer = '48 oz';
  } else if (pageText.includes('32') || pageText.includes('personal')) {
    requiredContainer = '20 oz';
  }

  // Determine recommended program
  let recommendedProgram = null;
  const programs = [
    'Smoothie',
    'Soup',
    'Frozen Dessert',
    'Dip',
    'Cocktail',
    'Nut Butter',
  ];
  for (const prog of programs) {
    if (pageText.includes(prog.toLowerCase())) {
      recommendedProgram = prog;
      break;
    }
  }

  return {
    id,
    name,
    category,
    subcategory: null,
    description,
    ingredients,
    instructions,
    tips,
    prepTime,
    blendTime,
    totalTime,
    servings,
    nutrition: null,
    requiredContainer,
    recommendedProgram,
    recommendedProducts: [],
    requiredFeatures: [],
    images: {
      primary: primaryImage.startsWith('http')
        ? primaryImage
        : primaryImage
        ? `${BASE_URL}${primaryImage}`
        : '',
      steps: [],
      remoteUrl: primaryImage,
    },
    url,
    crawledAt: new Date().toISOString(),
    contentHash: '',
  };
}

async function crawlAllRecipes() {
  console.log('\n🥤 Crawling Recipes...\n');

  const categories = [
    '',
    'smoothies',
    'soups',
    'frozen-desserts',
    'dips-spreads',
    'cocktails',
    'sauces-dressings',
    'non-dairy-milk',
  ];

  const allRecipes = [];
  const seenUrls = new Set();

  for (const category of categories) {
    console.log(`\nCategory: ${category || 'all'}`);
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 3) {
      try {
        const { recipes, hasNextPage } = await crawlRecipeListPage(
          category,
          page
        );

        for (const r of recipes) {
          if (!seenUrls.has(r.url)) {
            seenUrls.add(r.url);
            allRecipes.push(r);
          }
        }

        hasMore = hasNextPage;
        page++;
        await sleep(DELAY_MS);
      } catch (error) {
        console.log(`  Error on page ${page}: ${error.message}`);
        hasMore = false;
      }
    }
  }

  console.log(`\nFound ${allRecipes.length} unique recipes\n`);

  // Crawl each recipe detail (limit to first 50 for now)
  const recipesToCrawl = allRecipes.slice(0, 50);
  const detailedRecipes = [];

  for (let i = 0; i < recipesToCrawl.length; i++) {
    const r = recipesToCrawl[i];
    console.log(`[${i + 1}/${recipesToCrawl.length}] ${r.listingName}`);

    try {
      const details = await crawlRecipeDetail(r.url);
      detailedRecipes.push(details);
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }

    await sleep(DELAY_MS);
  }

  // Save recipes
  const recipesFile = {
    generatedAt: new Date().toISOString(),
    source: 'https://www.vitamix.com/recipes',
    count: detailedRecipes.length,
    categories: [...new Set(detailedRecipes.map((r) => r.category))],
    recipes: detailedRecipes,
  };

  await fs.writeFile(
    path.join(CONTENT_DIR, 'recipes/recipes.json'),
    JSON.stringify(recipesFile, null, 2)
  );

  console.log(`\n✅ Saved ${detailedRecipes.length} recipes\n`);
  return detailedRecipes;
}

// ============================================
// Image Downloader
// ============================================

async function downloadAllImages(products, recipes) {
  console.log('\n📸 Downloading Images...\n');

  const manifest = {
    generatedAt: new Date().toISOString(),
    totalCount: 0,
    downloadedCount: 0,
    failedCount: 0,
    totalSize: '0 MB',
    images: [],
  };

  // Download product images
  for (const product of products) {
    if (product.images?.primary) {
      const imageUrl = product.images.primary;
      const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
      const destPath = path.join(
        CONTENT_DIR,
        `images/products/${product.id}/primary${ext}`
      );

      manifest.totalCount++;
      const success = await downloadImage(imageUrl, destPath);

      if (success) {
        manifest.downloadedCount++;
        manifest.images.push({
          id: `product-${product.id}-primary`,
          localPath: destPath.replace(CONTENT_DIR, '/content'),
          remoteUrl: imageUrl,
          type: 'product',
          associatedWith: { type: 'product', id: product.id },
          alt: product.name,
          status: 'downloaded',
        });

        // Update product to use local path
        product.images.primary = destPath.replace(CONTENT_DIR, '/content');
      } else {
        manifest.failedCount++;
      }

      await sleep(100);
    }
  }

  // Download recipe images
  for (const recipe of recipes) {
    if (recipe.images?.primary) {
      const imageUrl = recipe.images.primary;
      const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
      const destPath = path.join(
        CONTENT_DIR,
        `images/recipes/${recipe.id}/primary${ext}`
      );

      manifest.totalCount++;
      const success = await downloadImage(imageUrl, destPath);

      if (success) {
        manifest.downloadedCount++;
        manifest.images.push({
          id: `recipe-${recipe.id}-primary`,
          localPath: destPath.replace(CONTENT_DIR, '/content'),
          remoteUrl: imageUrl,
          type: 'recipe',
          associatedWith: { type: 'recipe', id: recipe.id },
          alt: recipe.name,
          status: 'downloaded',
        });

        recipe.images.primary = destPath.replace(CONTENT_DIR, '/content');
      } else {
        manifest.failedCount++;
      }

      await sleep(100);
    }
  }

  // Save manifest
  await fs.writeFile(
    path.join(CONTENT_DIR, 'manifests/images-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(
    `\n✅ Downloaded ${manifest.downloadedCount}/${manifest.totalCount} images\n`
  );
  return manifest;
}

// ============================================
// Main
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const productsOnly = args.includes('--products-only');
  const recipesOnly = args.includes('--recipes-only');
  const imagesOnly = args.includes('--images-only');

  console.log('🚀 Vitamix Content Crawler\n');
  console.log(`Content directory: ${CONTENT_DIR}`);

  let products = [];
  let recipes = [];

  if (!imagesOnly) {
    if (!recipesOnly) {
      products = await crawlAllProducts();
    }

    if (!productsOnly) {
      recipes = await crawlAllRecipes();
    }
  }

  // Load existing data if only downloading images
  if (imagesOnly) {
    try {
      const productsData = await fs.readFile(
        path.join(CONTENT_DIR, 'products/products.json'),
        'utf-8'
      );
      products = JSON.parse(productsData).products || [];
    } catch (e) {
      console.log('No existing products.json found');
    }

    try {
      const recipesData = await fs.readFile(
        path.join(CONTENT_DIR, 'recipes/recipes.json'),
        'utf-8'
      );
      recipes = JSON.parse(recipesData).recipes || [];
    } catch (e) {
      console.log('No existing recipes.json found');
    }
  }

  // Download images
  if (!productsOnly && !recipesOnly) {
    await downloadAllImages(products, recipes);
  }

  console.log('\n🎉 Crawl complete!\n');
}

main().catch(console.error);
