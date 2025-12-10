#!/usr/bin/env node
/**
 * Vitamix Content Crawler with AI Extraction
 *
 * Uses Claude to extract structured data from vitamix.com pages.
 * This handles JavaScript-rendered content better than CSS selectors.
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, '../../content');

// Load .env from project root
config({ path: path.join(__dirname, '../../.env') });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AWS_BEARER_TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const USE_BEDROCK = process.env.USE_BEDROCK === '1' || !!AWS_BEARER_TOKEN;
// Use Haiku for faster/cheaper extraction - global prefix for cross-region inference
const BEDROCK_MODEL = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
// Amazon Titan for embeddings
const EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// Rate limiting
const DELAY_MS = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Load product URLs from JSON file (from sitemap)
import productUrlsData from './product-urls.json' with { type: 'json' };
const PRODUCT_URLS = productUrlsData.blenders;

// Load recipe URLs from JSON file
import recipeUrlsData from './recipe-urls.json' with { type: 'json' };
const RECIPE_URLS = recipeUrlsData.recipes;

// Use accessories from the product sitemap
const ACCESSORY_URLS = productUrlsData.accessories;

// ============================================
// Fetch and Extract with Claude
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

async function extractWithClaude(html, extractionPrompt) {
  const userMessage = `Extract structured data from this HTML page.

${extractionPrompt}

Respond with ONLY valid JSON, no markdown code blocks.

HTML (truncated to key content):
${html.slice(0, 50000)}`;

  let response;
  let content;

  if (USE_BEDROCK && AWS_BEARER_TOKEN) {
    // Use AWS Bedrock
    const bedrockUrl = `https://bedrock-runtime.${AWS_REGION}.amazonaws.com/model/${BEDROCK_MODEL}/invoke`;

    response = await fetch(bedrockUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AWS_BEARER_TOKEN}`,
      },
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Bedrock API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    content = data.content?.[0]?.text || '{}';
  } else {
    // Use direct Anthropic API
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    content = data.content[0]?.text || '{}';
  }

  // Parse JSON from response
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content);
  } catch (e) {
    console.log('  Failed to parse JSON:', e.message);
    return null;
  }
}

// ============================================
// Product Extraction
// ============================================

const PRODUCT_EXTRACTION_PROMPT = `Extract the following product information as JSON:
{
  "name": "product name",
  "price": 699.95,
  "originalPrice": 749.95,
  "description": "full product description",
  "tagline": "short marketing tagline",
  "features": ["feature 1", "feature 2", ...],
  "specs": {
    "watts": 1500,
    "capacity": "48 oz",
    "programs": 10,
    "warranty": "10-year warranty",
    "dimensions": "9.75 x 7.75 x 17",
    "weight": "14.25 lbs"
  },
  "bestFor": ["smoothies", "soups", ...],
  "imageUrl": "main product image URL"
}

If a field is not found, use null. Extract actual values from the page content.`;

async function extractProduct(url) {
  const id = url.split('/').pop();

  try {
    const html = await fetchPage(url);
    const extracted = await extractWithClaude(html, PRODUCT_EXTRACTION_PROMPT);

    if (!extracted || !extracted.name) {
      throw new Error('Failed to extract product data');
    }

    // Determine series from URL or name
    let series = 'other';
    const urlLower = url.toLowerCase();
    const nameLower = (extracted.name || '').toLowerCase();
    if (urlLower.includes('ascent') || nameLower.includes('ascent')) series = 'ascent';
    else if (urlLower.includes('5200') || nameLower.includes('5200')) series = '5200';
    else if (urlLower.includes('e310') || urlLower.includes('explorian') || nameLower.includes('explorian')) series = 'explorian';
    else if (urlLower.includes('propel') || nameLower.includes('propel')) series = 'propel';
    else if (urlLower.includes('immersion') || nameLower.includes('immersion')) series = 'immersion';
    else if (urlLower.includes('reconditioned')) series = 'reconditioned';

    return {
      id,
      sku: id.toUpperCase().replace(/-/g, '_'),
      name: extracted.name,
      series,
      url,
      price: extracted.price || 0,
      originalPrice: extracted.originalPrice || null,
      availability: 'in-stock',
      description: extracted.description || '',
      tagline: extracted.tagline || extracted.description?.split('.')[0] || '',
      features: extracted.features || [],
      bestFor: extracted.bestFor || [],
      warranty: extracted.specs?.warranty || '10-year warranty',
      specs: {
        watts: extracted.specs?.watts || 1500,
        capacity: extracted.specs?.capacity || '48 oz',
        programs: extracted.specs?.programs || 0,
        dimensions: extracted.specs?.dimensions || null,
        weight: extracted.specs?.weight || null,
      },
      images: {
        primary: extracted.imageUrl || '',
        gallery: [],
        remoteUrls: extracted.imageUrl ? [extracted.imageUrl] : [],
      },
      crawledAt: new Date().toISOString(),
      sourceUrl: url,
      contentHash: '',
    };
  } catch (error) {
    console.log(`  Error extracting ${url}: ${error.message}`);
    return null;
  }
}

// ============================================
// Recipe Extraction
// ============================================

const RECIPE_EXTRACTION_PROMPT = `Extract the following recipe information as JSON:
{
  "name": "recipe name",
  "description": "recipe description",
  "category": "smoothies/soups/desserts/frozen-treats/dips/sauces/drinks/cocktails/baby-food/nut-butters/dairy-alternatives/breads/flours/breakfast",
  "subcategory": "more specific category if available",
  "difficulty": "easy/medium/advanced",
  "prepTime": "5 minutes",
  "blendTime": "45 seconds",
  "totalTime": "6 minutes",
  "servings": 4,
  "yield": "2 cups or other yield measurement",
  "ingredients": [
    {"item": "ingredient name", "quantity": "1", "unit": "cup", "notes": "optional prep notes"}
  ],
  "instructions": ["step 1", "step 2", ...],
  "tips": ["tip 1", "tip 2"],
  "nutrition": {
    "calories": 150,
    "protein": "5g",
    "carbs": "20g",
    "fat": "3g",
    "fiber": "4g",
    "sugar": "10g",
    "sodium": "50mg"
  },
  "dietaryTags": ["vegan", "gluten-free", "low-calorie", "keto-friendly", "etc"],
  "requiredContainer": "64 oz or 48 oz or 20 oz or Food Processor etc",
  "recommendedProgram": "Smoothie/Hot Soup/Frozen Dessert/etc if mentioned",
  "blenderSpeed": "Variable 1-10 or High speed",
  "compatibleProducts": ["product names mentioned as compatible"],
  "imageUrl": "main recipe image URL"
}

Extract actual values from the page content. For nutrition, look for a nutrition panel or facts. For dietary tags, look for icons or labels like "vegan", "gluten-free", etc.`;

async function extractRecipe(url) {
  const id = url.split('/').pop();

  try {
    const html = await fetchPage(url);
    const extracted = await extractWithClaude(html, RECIPE_EXTRACTION_PROMPT);

    if (!extracted || !extracted.name) {
      throw new Error('Failed to extract recipe data');
    }

    return {
      id,
      name: extracted.name,
      category: extracted.category || 'general',
      subcategory: extracted.subcategory || null,
      description: extracted.description || '',
      difficulty: extracted.difficulty || 'easy',
      ingredients: extracted.ingredients || [],
      instructions: extracted.instructions || [],
      tips: extracted.tips || [],
      prepTime: extracted.prepTime || '',
      blendTime: extracted.blendTime || '',
      totalTime: extracted.totalTime || extracted.prepTime || '',
      servings: extracted.servings || 4,
      yield: extracted.yield || null,
      nutrition: extracted.nutrition || null,
      dietaryTags: extracted.dietaryTags || [],
      requiredContainer: extracted.requiredContainer || '64 oz',
      recommendedProgram: extracted.recommendedProgram || null,
      blenderSpeed: extracted.blenderSpeed || null,
      recommendedProducts: extracted.compatibleProducts || [],
      requiredFeatures: [],
      images: {
        primary: extracted.imageUrl || '',
        steps: [],
        remoteUrl: extracted.imageUrl || '',
      },
      url,
      crawledAt: new Date().toISOString(),
      contentHash: '',
    };
  } catch (error) {
    console.log(`  Error extracting ${url}: ${error.message}`);
    return null;
  }
}

// ============================================
// Accessory Extraction
// ============================================

const ACCESSORY_EXTRACTION_PROMPT = `Extract the following accessory/container information as JSON:
{
  "name": "product name",
  "type": "container/tamper/blade/lid/food-processor/immersion-blender/accessory",
  "price": 99.95,
  "originalPrice": 129.95,
  "description": "full product description",
  "features": ["feature 1", "feature 2"],
  "specs": {
    "capacity": "48 oz or null",
    "dimensions": "6.5 x 8 x 10 inches",
    "weight": "3.75 lbs",
    "material": "Tritan/Stainless Steel/etc",
    "dishwasherSafe": true,
    "bpaFree": true
  },
  "compatibility": {
    "series": ["Ascent", "Venturist", "Classic", "etc"],
    "machines": ["specific machine names if listed"],
    "selfDetect": true
  },
  "includedItems": ["what comes in the box"],
  "imageUrl": "main product image URL"
}

Extract actual values from the page content.`;

async function extractAccessory(url) {
  const id = url.split('/').pop();
  const category = url.includes('container') ? 'container' :
    url.includes('tamper') ? 'tamper' :
    url.includes('food-processor') ? 'food-processor' :
    url.includes('immersion') ? 'immersion-blender' :
    url.includes('blade') ? 'blade' :
    url.includes('lid') ? 'lid' : 'accessory';

  try {
    const html = await fetchPage(url);
    const extracted = await extractWithClaude(html, ACCESSORY_EXTRACTION_PROMPT);

    if (!extracted || !extracted.name) {
      throw new Error('Failed to extract accessory data');
    }

    return {
      id,
      name: extracted.name,
      type: extracted.type || category,
      url,
      price: extracted.price || 0,
      originalPrice: extracted.originalPrice || null,
      availability: 'in-stock',
      description: extracted.description || '',
      features: extracted.features || [],
      specs: extracted.specs || {},
      compatibility: extracted.compatibility || {},
      includedItems: extracted.includedItems || [],
      images: {
        primary: extracted.imageUrl || '',
        gallery: [],
        remoteUrls: extracted.imageUrl ? [extracted.imageUrl] : [],
      },
      crawledAt: new Date().toISOString(),
      sourceUrl: url,
    };
  } catch (error) {
    console.log(`  Error extracting ${url}: ${error.message}`);
    return null;
  }
}

async function crawlAccessories() {
  console.log('\n🔧 Crawling Accessories with AI Extraction...\n');

  const accessories = [];

  for (let i = 0; i < ACCESSORY_URLS.length; i++) {
    const url = ACCESSORY_URLS[i];
    console.log(`[${i + 1}/${ACCESSORY_URLS.length}] ${url.split('/').pop()}`);

    const accessory = await extractAccessory(url);
    if (accessory) {
      accessories.push(accessory);
      console.log(`  ✓ ${accessory.name} - $${accessory.price}`);
    }

    await sleep(DELAY_MS);
  }

  // Save accessories
  const accessoriesFile = {
    generatedAt: new Date().toISOString(),
    source: 'https://www.vitamix.com/us/en_us/shop/accessories',
    count: accessories.length,
    categories: [...new Set(accessories.map((a) => a.type))],
    accessories,
  };

  await fs.mkdir(path.join(CONTENT_DIR, 'accessories'), { recursive: true });
  await fs.writeFile(
    path.join(CONTENT_DIR, 'accessories/accessories.json'),
    JSON.stringify(accessoriesFile, null, 2)
  );

  console.log(`\n✅ Saved ${accessories.length} accessories\n`);
  return accessories;
}

// ============================================
// Main
// ============================================

async function crawlProducts() {
  console.log('\n📦 Crawling Products with AI Extraction...\n');

  const products = [];

  for (let i = 0; i < PRODUCT_URLS.length; i++) {
    const url = PRODUCT_URLS[i];
    console.log(`[${i + 1}/${PRODUCT_URLS.length}] ${url.split('/').pop()}`);

    const product = await extractProduct(url);
    if (product) {
      products.push(product);
      console.log(`  ✓ ${product.name} - $${product.price}`);
    }

    await sleep(DELAY_MS);
  }

  // Save products
  const productsFile = {
    generatedAt: new Date().toISOString(),
    source: 'https://www.vitamix.com',
    count: products.length,
    products,
  };

  await fs.writeFile(
    path.join(CONTENT_DIR, 'products/products.json'),
    JSON.stringify(productsFile, null, 2)
  );

  console.log(`\n✅ Saved ${products.length} products\n`);
  return products;
}

async function crawlRecipes() {
  console.log('\n🥤 Crawling Recipes with AI Extraction...\n');

  const recipes = [];

  for (let i = 0; i < RECIPE_URLS.length; i++) {
    const url = RECIPE_URLS[i];
    console.log(`[${i + 1}/${RECIPE_URLS.length}] ${url.split('/').pop()}`);

    const recipe = await extractRecipe(url);
    if (recipe) {
      recipes.push(recipe);
      console.log(`  ✓ ${recipe.name}`);
    }

    await sleep(DELAY_MS);
  }

  // Save recipes
  const recipesFile = {
    generatedAt: new Date().toISOString(),
    source: 'https://www.vitamix.com/recipes',
    count: recipes.length,
    categories: [...new Set(recipes.map((r) => r.category))],
    recipes,
  };

  await fs.writeFile(
    path.join(CONTENT_DIR, 'recipes/recipes.json'),
    JSON.stringify(recipesFile, null, 2)
  );

  console.log(`\n✅ Saved ${recipes.length} recipes\n`);
  return recipes;
}

async function main() {
  if (!ANTHROPIC_API_KEY && !AWS_BEARER_TOKEN) {
    console.error('Error: Neither ANTHROPIC_API_KEY nor AWS_BEARER_TOKEN_BEDROCK found in .env');
    process.exit(1);
  }

  console.log('🚀 Vitamix Content Crawler (AI-Powered)\n');
  console.log(`Content directory: ${CONTENT_DIR}`);
  console.log(`API: ${USE_BEDROCK ? 'AWS Bedrock' : 'Anthropic Direct'}`);
  if (USE_BEDROCK) {
    console.log(`Model: ${BEDROCK_MODEL}`);
    console.log(`Region: ${AWS_REGION}`);
  }
  console.log(`Recipe URLs: ${RECIPE_URLS.length}`);
  console.log(`Accessory URLs: ${ACCESSORY_URLS.length}`);
  console.log(`Product URLs: ${PRODUCT_URLS.length}\n`);

  const args = process.argv.slice(2);

  if (args.includes('--products-only')) {
    await crawlProducts();
  } else if (args.includes('--recipes-only')) {
    await crawlRecipes();
  } else if (args.includes('--accessories-only')) {
    await crawlAccessories();
  } else if (args.includes('--all')) {
    // Crawl everything
    await crawlProducts();
    await crawlRecipes();
    await crawlAccessories();
  } else {
    // Default: products and recipes
    await crawlProducts();
    await crawlRecipes();
  }

  console.log('🎉 Crawl complete!\n');
}

main().catch(console.error);
