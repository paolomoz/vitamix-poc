/**
 * Orchestrator - Coordinates the AI-driven recommendation pipeline
 *
 * Pipeline stages:
 * 1. Fast Classification (Cerebras 8B) - Classify user intent
 * 2. Deep Reasoning (Claude Opus) - Select blocks and explain thinking
 * 3. Content Generation (Cerebras 70B) - Generate block content in parallel
 * 4. HTML Assembly - Build DA-compliant HTML
 * 5. SSE Streaming - Stream blocks to client
 */

import type {
  Env,
  IntentClassification,
  SessionContext,
  ReasoningResult,
  BlockSelection,
  SSEEvent,
  Product,
  Recipe,
  Review,
} from '../types';
import { createModelFactory, type Message } from '../ai-clients/model-factory';
import { analyzeAndSelectBlocks, formatReasoningForDisplay } from '../ai-clients/reasoning-engine';
import {
  buildRAGContext,
  getProductById,
  getRecipeById,
  getAllProducts,
  getProductsByUseCase,
  getAllReviews,
  getFAQsForQuery,
  type RAGContext,
  type FAQ,
} from '../content/content-service';
import { selectHeroImage } from './hero-images';

// ============================================
// Types
// ============================================

interface OrchestrationContext {
  query: string;
  slug: string;
  intent?: IntentClassification;
  ragContext?: RAGContext;
  reasoningResult?: ReasoningResult;
  generatedBlocks?: GeneratedBlock[];
}

interface GeneratedBlock {
  type: string;
  html: string;
  sectionStyle?: string;
}

type SSECallback = (event: SSEEvent) => void;

// ============================================
// Intent Classification
// ============================================

const CLASSIFICATION_PROMPT = `Classify the user's intent for a Vitamix blender recommendation system.

IMPORTANT: Check for special intent types FIRST:
- "support": User has a problem, is frustrated, mentions warranty, broken, issue, return
- "gift": User is buying for someone else (birthday, wedding, christmas, "for my mom")
- "medical": User mentions health conditions (dysphagia, stroke, medical diet)
- "accessibility": User mentions physical limitations (arthritis, grip, heavy, mobility)
- "partnership": User asks about affiliate programs, B2B, bulk orders, commercial use

Output JSON only:
{
  "intentType": "discovery|comparison|product-detail|use-case|specs|reviews|price|recommendation|support|gift|medical|accessibility|partnership",
  "confidence": 0.0-1.0,
  "entities": {
    "products": ["product names mentioned"],
    "useCases": ["smoothies", "soups", etc.],
    "features": ["self-cleaning", "preset programs", etc.],
    "priceRange": "budget|mid|premium|null"
  },
  "journeyStage": "exploring|comparing|deciding",
  "userMode": "quick|research|gift|support|commercial"
}`;

async function classifyIntent(
  query: string,
  env: Env,
  sessionContext?: SessionContext,
  preset?: string
): Promise<IntentClassification> {
  const modelFactory = createModelFactory(env, preset);

  const contextInfo = sessionContext?.previousQueries?.length
    ? `\n\nPrevious queries in this session:\n${sessionContext.previousQueries.map((q) => `- "${q.query}" (${q.intent})`).join('\n')}`
    : '';

  const messages: Message[] = [
    { role: 'system', content: CLASSIFICATION_PROMPT },
    { role: 'user', content: `Query: "${query}"${contextInfo}` },
  ];

  try {
    const response = await modelFactory.call('classification', messages, env);
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Classification error:', error);
  }

  // Fallback classification
  return {
    intentType: 'discovery',
    confidence: 0.5,
    entities: { products: [], useCases: [], features: [] },
    journeyStage: 'exploring',
  };
}

// ============================================
// RAG Context from Content Service
// ============================================

async function getRAGContext(
  query: string,
  intent: IntentClassification,
  _env: Env
): Promise<RAGContext> {
  // Build RAG context from local content
  const context = buildRAGContext(query, intent.intentType);

  return context;
}

// ============================================
// Content Generation
// ============================================

function normalizeImageUrl(imagePath: string | undefined): string {
  if (!imagePath || imagePath === 'no-image') return 'no-image';

  // If already a full URL, return as-is
  if (imagePath.startsWith('http')) return imagePath;

  // Convert relative paths to full Vitamix URLs
  if (imagePath.startsWith('/content/dam/')) {
    return `https://www.vitamix.com${imagePath}`;
  }

  // Handle other relative paths
  if (imagePath.startsWith('/')) {
    return `https://www.vitamix.com${imagePath}`;
  }

  return imagePath;
}

function buildProductContext(products: Product[]): string {
  if (!products.length) return 'No products available.';
  return products.map(p => {
    const imageUrl = normalizeImageUrl(p.images?.primary);
    return `
- ${p.name} (${p.series})
  Price: $${p.price}
  Warranty: ${p.warranty || 'Full Warranty'}
  Image: ${imageUrl}
  URL: ${p.url}
  Tagline: ${p.tagline || p.description?.slice(0, 100) || 'Premium blender'}
  Features: ${p.features?.slice(0, 3).join(', ') || 'High performance blending'}
  Best for: ${p.bestFor?.join(', ') || 'All blending tasks'}
`;
  }).join('\n');
}

function buildRecipeContext(recipes: Recipe[]): string {
  if (!recipes.length) return 'No recipes available.';
  return recipes.map(r => {
    const imageUrl = normalizeImageUrl(r.images?.primary || r.images?.remoteUrl);
    return `
- ${r.name}
  Category: ${r.category}
  Time: ${r.time || r.prepTime || '10 min'}
  Difficulty: ${r.difficulty || 'easy'}
  Image: ${imageUrl}
  URL: ${r.url || '#'}
`;
  }).join('\n');
}

function buildUseCaseContext(useCases: Array<{ id: string; name: string; description: string; icon: string }>): string {
  if (!useCases.length) return 'No use cases available.';
  return useCases.map(uc => `
- ${uc.name}
  ID: ${uc.id}
  Description: ${uc.description}
  Icon: ${uc.icon}
`).join('\n');
}

function buildTestimonialContext(reviews: Review[]): string {
  if (!reviews.length) return 'No testimonials available.';
  return reviews.map(r => {
    const sourceInfo = r.sourceUrl ? `\n  Source URL: ${r.sourceUrl}` : '';
    const typeInfo = r.sourceType ? ` (${r.sourceType})` : '';
    return `
- "${r.content}"
  Author: ${r.author}${r.authorTitle ? `, ${r.authorTitle}` : ''}${typeInfo}${sourceInfo}`;
  }).join('\n');
}

function buildFAQContext(faqs: FAQ[]): string {
  if (!faqs.length) return 'No FAQs available.';
  return faqs.map(faq => `
- Q: ${faq.question}
  A: ${faq.answer}
  Category: ${faq.category}`).join('\n');
}

function getBlockTemplate(blockType: string): string {
  const templates: Record<string, string> = {
    'use-case-cards': `
## HTML Template (REQUIRED: header + 3-4 cards):

YOU MUST OUTPUT THIS HEADER FIRST - IT IS REQUIRED:
<header class="ucheader">
  <h2 class="uctitle">[WRITE A TITLE TAILORED TO THE USER'S QUESTION]</h2>
  <p class="ucsubtitle">[Brief subtitle about what these use cases help accomplish]</p>
</header>

THEN output 3-4 use case cards:
<div class="use-case-card">
  <div class="use-case-icon">🥤</div>
  <div class="use-case-content">
    <h4 class="use-case-title">Use Case Name</h4>
    <p class="use-case-description">Brief description of this use case.</p>
  </div>
</div>

CRITICAL: The header element MUST be the first thing in your output. Do not skip it.`,

    'recipe-cards': `
## HTML Template (generate cards ONLY for recipes provided in context):
CRITICAL: Use ONLY the recipes provided in the context below. Do NOT invent recipe names.
If a recipe has 'no-image', skip the image div entirely.

ALWAYS start with a title and optional subtitle that connects to the user's query:
- Title: Empathetic, helpful headline (e.g., "Recipes You Might Love", "Ideas to Get You Started")
- Subtitle (optional): If the recipes don't exactly match the query, add a brief empathetic note explaining what you're showing instead

SPECIAL GUIDANCE FOR FAMILY/KIDS QUERIES:
If the user mentions kids, picky eaters, family, or hiding vegetables:
- Title should acknowledge the parenting challenge (e.g., "Kid-Approved Recipes", "Sneak Veggies Into These Favorites")
- Subtitle should reassure parents (e.g., "These recipes are proven hits with even the pickiest eaters")
- PRIORITIZE soup recipes that hide vegetables - soups blend veggies into undetectable smoothness
- Include smoothie recipes for kids who love fruity drinks
- Add a brief note about how each recipe helps with picky eaters (e.g., "The creamy texture hides the spinach!")

IMPORTANT:
- Wrap everything in a single parent div with class "recipe-cards"
- Each card must be a div (not an anchor) - the link goes inside the title
- Use div elements as direct children so DA can persist the content properly
- Include the recipe URL as a separate link element to ensure it persists through DA

<div class="recipe-cards">
  <div class="rcheader">
    <h3 class="rctitle">Recipes You Might Love</h3>
    <p class="rcsubtitle">Brief context about why these recipes are shown, if needed.</p>
  </div>
  <div class="recipe-card" data-href="EXACT_RECIPE_URL_FROM_CONTEXT">
    <div class="recipe-card-image">
      <picture><img src="EXACT_IMAGE_URL_FROM_CONTEXT" alt="Recipe name" loading="lazy"></picture>
    </div>
    <div class="recipe-card-content">
      <h4 class="recipe-card-title"><a href="EXACT_RECIPE_URL_FROM_CONTEXT">Exact Recipe Name From Context</a></h4>
      <p class="recipe-card-description">Time and difficulty from context.</p>
      <p class="recipe-card-link"><a href="EXACT_RECIPE_URL_FROM_CONTEXT">View Recipe</a></p>
    </div>
  </div>
  <!-- Only include recipes that exist in the provided context -->
</div>`,

    'product-cards': `
## HTML Template (REQUIRED: header + 3-4 product cards):

YOU MUST OUTPUT THIS HEADER FIRST - IT IS REQUIRED:
<header class="pcheader">
  <h2 class="pctitle">[WRITE A TITLE TAILORED TO THE USER'S QUESTION - e.g., "Blenders Perfect for Smoothies"]</h2>
  <p class="pcsubtitle">[Brief subtitle about why these products match their needs]</p>
</header>

CRITICAL RULES:
- Use EXACT image URLs and product URLs from the context below
- Do NOT include star ratings - we don't have rating data
- Do NOT invent product names - use exact names from context
- CTA TEXT MUST BE VALUE-DRIVEN based on product's "Best for" data (NOT generic "View Details")

CTA TEXT GUIDELINES (pick the most relevant):
- If product is best for smoothies: "Perfect for Your Smoothies"
- If product is best for soups: "Great for Hot Soups"
- If product is best for families: "Ideal for Family Meals"
- For premium products: "Explore the [Product Name]"
- Generic fallback: "See Why It's Right for You"
NEVER use generic CTAs like "View Details", "Learn More", or "Shop Now"

THEN output 3-4 product cards (each card is a ROW with two CELLS - image cell and content cell):
<div class="product-card">
  <div>
    <picture><img src="EXACT_IMAGE_URL_FROM_CONTEXT" alt="Product Name" loading="lazy"></picture>
  </div>
  <div>
    <h3><a href="EXACT_PRODUCT_URL_FROM_CONTEXT" target="_blank">Exact Product Name</a></h3>
    <p>Brief tagline from context</p>
    <p>$XXX.XX</p>
    <p><a href="EXACT_PRODUCT_URL_FROM_CONTEXT" class="button" target="_blank">[VALUE-DRIVEN CTA TEXT]</a></p>
  </div>
</div>

CRITICAL: The header element MUST be the first thing in your output. Each product-card must have a div>div>picture>img structure for images.`,

    'feature-highlights': `
## HTML Template (REQUIRED: header + 3-4 feature rows):

YOU MUST OUTPUT THIS HEADER FIRST - IT IS REQUIRED:
<header class="fhheader">
  <h2 class="fhtitle">[WRITE A TITLE TAILORED TO THE USER'S QUESTION]</h2>
  <p class="fhsubtitle">[Brief subtitle about what these features help accomplish]</p>
</header>

THEN output 3-4 feature rows like this:
<div>
  <div>
    <h3>Feature Name</h3>
    <p>Description of this feature and its benefits.</p>
  </div>
</div>
<div>
  <div>
    <h3>Another Feature</h3>
    <p>Another benefit description.</p>
  </div>
</div>

SPECIAL GUIDANCE FOR FAMILY/KIDS QUERIES:
If the user mentions kids, family, picky eaters, or hiding vegetables, ALWAYS include these features:
1. Hot Soup Program - Highlight how it creates silky-smooth soups that hide vegetables completely. Kids can't detect spinach, kale, or other greens when blended to perfection.
2. Self-Cleaning - Emphasize the 60-second cleanup for busy parents.
3. Variable Speed Control - Explain how it lets you get the exact texture kids prefer - no chunks!
4. Smoothie Capabilities - For kids who love fruity drinks, mention how you can sneak spinach into berry smoothies.

CRITICAL: The header element MUST be the first thing in your output. Do not skip it.`,

    'hero': `
## HTML Template (two-column layout: image | content):

CRITICAL STRUCTURE REQUIREMENT:
You MUST output HTML with EXACTLY this nested div structure. The hero block REQUIRES:
- An outer row div containing exactly TWO child divs
- First child div: contains ONLY a picture element with the hero image
- Second child div: contains the text content (optional eyebrow, h1, description, button)

DO NOT output flat content like <p>, <h1>, <ul> directly. Everything MUST be inside the two-cell structure.

SPECIAL GUIDANCE FOR FAMILY/KIDS QUERIES:
If the user mentions kids, family, picky eaters, or hiding vegetables:
- Headline should be empathetic and solution-focused
- Eyebrow can reference their challenge
- Description should highlight both soup-making for hiding veggies AND smoothies for fruit-loving kids

CTA TEXT MUST BE VALUE-DRIVEN (NOT generic):
- For smoothie queries: "Find Your Perfect Smoothie Blender"
- For soup queries: "Discover Restaurant-Quality Soups"
- For families: "Explore Blenders for Your Family"
- For health-focused: "Start Your Wellness Journey"
- Generic: "Find the Right Blender for You"
NEVER use "Shop Now", "Buy Now", or "Learn More"

OUTPUT THIS EXACT STRUCTURE (replace placeholders with actual content):
<div>
  <div>
    <picture>
      <img src="HERO_IMAGE_URL" alt="Hero image">
    </picture>
  </div>
  <div>
    <h1>Your Headline Here</h1>
    <p>Your description text here explaining the value proposition.</p>
    <p><a href="#" class="button">[VALUE-DRIVEN CTA - e.g., "Find Your Perfect Smoothie Blender"]</a></p>
  </div>
</div>

REMEMBER: The outer div contains TWO child divs. Image in first, content in second. No exceptions.`,

    'specs-table': `
## HTML Template (REQUIRED: h3 title + vertical label/value pairs):

YOU MUST OUTPUT THIS TITLE FIRST - IT IS REQUIRED:
<h3>[Product Model Name] Specifications</h3>

THEN output 5-8 spec rows like this (each row has TWO cells: label and value):
<div>
  <div>Motor</div>
  <div>2.2 HP Peak</div>
</div>
<div>
  <div>Container Size</div>
  <div>64 oz</div>
</div>
<div>
  <div>Programs</div>
  <div>5 Pre-programmed settings</div>
</div>
<div>
  <div>Warranty</div>
  <div>10 Years Full</div>
</div>
<div>
  <div>Dimensions</div>
  <div>17.5" H x 8.5" W x 7.7" D</div>
</div>

CRITICAL: The <h3> title with the product model name MUST be the first thing in your output. Do not skip it.`,

    'faq': `
## HTML Template (accordion Q&A pairs):
Each row has TWO cells: question cell and answer cell.
CRITICAL: Use ONLY the FAQs provided in the context below. Do NOT invent FAQs.
Copy the questions and answers EXACTLY from the provided data.

<div>
  <div>EXACT_QUESTION_FROM_CONTEXT?</div>
  <div>EXACT_ANSWER_FROM_CONTEXT</div>
</div>
<div>
  <div>EXACT_QUESTION_FROM_CONTEXT?</div>
  <div>EXACT_ANSWER_FROM_CONTEXT</div>
</div>
<!-- Include 4-6 FAQs from the provided context -->`,

    'testimonials': `
## HTML Template (use ONLY the real testimonials provided below):
CRITICAL: Use the EXACT quotes from the testimonial data below. Do NOT invent testimonials.
Include 3-4 testimonials. If a testimonial has a sourceUrl, include it as a "Read more" link.

Structure: Output simple table rows that the block JS will transform.
- Row 1: Section title
- Remaining rows: One testimonial per row with two cells (avatar placeholder, content)

<div>
  <div><h2>What Professionals & Customers Say</h2></div>
</div>
<div>
  <div><img src="/icons/user-avatar.svg" alt="Author Name"></div>
  <div>
    <p>★★★★★</p>
    <p>"EXACT_QUOTE_FROM_CONTEXT"</p>
    <p><strong>Author Name</strong>, Author Title</p>
    <p><a href="SOURCE_URL_IF_AVAILABLE" target="_blank">Read the full story</a></p>
  </div>
</div>
<!-- Repeat for each testimonial from context, omit source link if no sourceUrl -->`,

    'comparison-table': `
## HTML Template (generate rows for a comparison table):
First row is header with product names (LINKED to their vitamix.com pages), remaining rows are spec comparisons.
Output simple divs - the block JS will convert to a table.

IMPORTANT:
- Product names in the header row MUST be links to their vitamix.com product pages.
- ONLY compare Vitamix products to each other - we do not have competitor data.
- If user mentions a competitor brand (Blendtec, Ninja, etc.), compare 2-3 Vitamix models instead and note that competitor specs are not available.

SPECIAL GUIDANCE FOR FAMILY/KIDS QUERIES:
If the user mentions kids, family, picky eaters, or hiding vegetables:
- ALWAYS include these comparison rows that matter for families:
  1. Hot Soup Program (Yes/No) - critical for hiding vegetables in soups
  2. Container Size (oz) - larger is better for family batches
  3. Self-Cleaning - busy parents need quick cleanup
  4. Preset Programs - easier for the whole family to use
  5. Warranty - families need long-term reliability
- Add a row note: "Best for hiding veggies in soups: [product with hot soup program]"

REQUIRED: PRICING VALUE SUMMARY ROW
After the header, include a "Value Proposition" row that summarizes what each product is best for:
- For budget products: "Best Value - Great entry point"
- For mid-range: "Most Popular - Best balance of features"
- For premium: "Top Features - Maximum versatility"
This helps users quickly understand which product matches their priorities.

<div>
  <div></div>
  <div><strong><a href="EXACT_PRODUCT_A_URL" target="_blank">Product A Name</a></strong></div>
  <div><strong><a href="EXACT_PRODUCT_B_URL" target="_blank">Product B Name</a></strong></div>
</div>
<div>
  <div><strong>Value Proposition</strong></div>
  <div>Best Value - Great for beginners</div>
  <div>Top Features - Maximum versatility</div>
</div>
<div>
  <div><strong>Price</strong></div>
  <div>$XXX</div>
  <div>$YYY</div>
</div>
<div>
  <div><strong>Price Difference</strong></div>
  <div>-</div>
  <div>$ZZZ more for [key additional feature]</div>
</div>
<div>
  <div><strong>Motor</strong></div>
  <div>2.2 HP</div>
  <div>2.0 HP</div>
</div>
<!-- Add more spec rows as needed -->
<div>
  <div><strong>Best For</strong></div>
  <div>[Use case this product excels at]</div>
  <div>[Use case this product excels at]</div>
</div>`,

    'product-recommendation': `
## HTML Template - Generate ONE primary product recommendation.

CRITICAL: THE IMAGE IS REQUIRED!
You MUST include the product image from the context below. Look for the "Image:" field in the product data.
Do NOT output an empty image div. The image URL must be included.

Pick the BEST single product that matches the user's needs. Do NOT list multiple products.

SPECIAL GUIDANCE FOR FAMILY/KIDS QUERIES:
If the user mentions kids, family, picky eaters, or hiding vegetables:
- Eyebrow should reference their family situation
- Body should mention Hot Soup Program, smoothie capabilities, self-cleaning, large container

CTA TEXT MUST BE VALUE-DRIVEN (NOT generic):
- For smoothie users: "Get the [Product] for Perfect Smoothies"
- For soup lovers: "Start Making Restaurant-Quality Soups"
- For families: "Get the [Product] for Your Family"
- For health-focused: "Start Your Wellness Journey"
- Generic: "See Why It's Perfect for You"
NEVER use "View on Vitamix", "Learn More", or "View Details"

OUTPUT THIS EXACT STRUCTURE (replace placeholders with actual values from context):
<div class="product-recommendation">
  <div>
    <div>
      <picture><img src="USE_THE_IMAGE_URL_FROM_PRODUCT_CONTEXT" alt="Product Name"></picture>
    </div>
    <div>
      <p class="product-recommendation-eyebrow">BEST FOR [USE CASE]</p>
      <h2 class="product-recommendation-headline">Product Name from Context</h2>
      <p class="product-recommendation-body">Why this product is the best choice. Be specific about features.</p>
      <p class="product-recommendation-price">$XXX.XX · Warranty from context</p>
      <p><a href="PRODUCT_URL_FROM_CONTEXT" class="button primary" target="_blank">[VALUE-DRIVEN CTA - e.g., "Get the A3500 for Your Family"]</a></p>
    </div>
  </div>
</div>

REMEMBER: The image MUST be included. Check the product context for the Image URL. The structure must be: block > row > cells.`,

    'quick-answer': `
## HTML Template (simple direct answer):
Generate a simple, direct answer for yes/no or quick confirmation questions. Structure:
- Row 1: Short headline answer (e.g., "Get the Vitamix.", "Yes, absolutely.", "It's worth it.")
- Row 2: Brief explanation (1-2 sentences why)
- Row 3 (optional): Expanded details for "Tell me more" section

<div>
  <div>Get the Vitamix.</div>
</div>
<div>
  <div>Yes, Vitamix excels at this exact task, allowing for variable speed control to get the right texture and a powerful motor to handle cooked proteins.</div>
</div>
<div>
  <div>With its variable speed control and powerful motor, Vitamix is the perfect choice for handling a variety of tasks, including blending cooked proteins to the perfect consistency.</div>
</div>`,

    'support-triage': `
## HTML Template (help frustrated customers):
Generate empathetic support content. Structure:
- Row 1: Issue type identified
- Row 2: Empathy message (acknowledge their frustration)
- Row 3: Resolution path/warranty info
- Row 4: Primary CTA (warranty claim link)
- Row 5: Secondary CTA (contact support link)
- Row 6 (optional): Troubleshooting steps

<div>
  <div>Container Issue</div>
</div>
<div>
  <div>I understand how frustrating this must be, especially after investing in a quality blender. Let's get this resolved for you.</div>
</div>
<div>
  <div>Container blade issues are typically covered under your Vitamix warranty. Check your model's warranty period in the product context below - you may be eligible for a free replacement.</div>
</div>
<div>
  <div><a href="https://www.vitamix.com/support/warranty">Start Warranty Claim</a></div>
</div>
<div>
  <div><a href="https://www.vitamix.com/contact">Chat with Support</a></div>
</div>
<div>
  <div><ol><li>Check that the container is properly seated on the base</li><li>Inspect the blade assembly for visible damage</li><li>Try running with just water to test</li></ol></div>
</div>`,

    'budget-breakdown': `
## HTML Template (price transparency):
Generate budget-friendly options. Structure:
- Row 1: Title
- Rows 2+: Price tiers with tier name in first cell, products in second cell

<div>
  <div>Your Options by Budget</div>
</div>
<div>
  <div>Under $350</div>
  <div><ul><li>Explorian E310: $299</li><li>Certified Reconditioned: from $199</li></ul></div>
</div>
<div>
  <div>$350-$500</div>
  <div><ul><li>Explorian E320: $449</li><li>Ascent A2300: $499</li></ul></div>
</div>
<div>
  <div>Refurbished Deals</div>
  <div><ul><li>Reconditioned A2500: $299</li><li>Reconditioned A3500: $399</li></ul></div>
</div>`,

    'accessibility-specs': `
## HTML Template (physical/ergonomic specs):
Generate accessibility-focused specifications. Structure:
- Row 1: Title
- Rows 2+: Product rows with product name (LINKED to vitamix.com URL) | weight | lid ease | control type

IMPORTANT: Use the actual product URLs from the context data. Do NOT use placeholder URLs like "PRODUCT_URL" or "#".

<div>
  <div>Ease of Use Specifications</div>
</div>
<div>
  <div><a href="EXACT_PRODUCT_URL_FROM_CONTEXT" target="_blank">Product Name</a></div>
  <div>Weight in lbs</div>
  <div>Lid ease description</div>
  <div>Control type</div>
</div>
<!-- Repeat for 2-4 products from context -->`,

    'empathy-hero': `
## HTML Template (warm, acknowledging hero):
Generate empathetic content that validates the user's situation. Structure:
- Row 1: Empathetic headline (acknowledge their situation)
- Row 2: Supportive message
- Row 3: Promise to help

IMPORTANT: Do NOT include any CTA buttons. The empathy-hero is purely for acknowledgment and comfort.
The actionable content (product recommendations, specs) follows in subsequent blocks.

<div>
  <div>I hear you.</div>
</div>
<div>
  <div>Preparing safe, consistent meals when texture matters isn't just cooking—it's care. Every blend needs to be perfect, and that responsibility weighs on you.</div>
</div>
<div>
  <div>Let me help you find a blender that gives you peace of mind, every single time.</div>
</div>`,

    'sustainability-info': `
## HTML Template (environmental responsibility):
Generate content about Vitamix's environmental responsibility. Structure:
- Row 1: Title
- Row 2: Manufacturing info
- Row 3: Materials info
- Row 4: Lifespan info
- Row 5 (optional): Recycling/end-of-life info

<div>
  <div>Environmental Responsibility</div>
</div>
<div>
  <div>Made in Cleveland, Ohio with domestic and global components. Designed for repairability with replaceable parts.</div>
</div>
<div>
  <div>BPA-free Tritan containers. Recyclable packaging. No harmful plasticizers or phthalates.</div>
</div>
<div>
  <div>Built to last 10-20+ years with proper care, reducing replacement cycles compared to disposable blenders.</div>
</div>
<div>
  <div>Blade assemblies can be replaced rather than discarding entire unit. Motor base designed for long-term service.</div>
</div>`,

    'smart-features': `
## HTML Template (connected/app capabilities):
Generate honest content about smart features. Structure:
- Row 1: Title
- Row 2: App features
- Row 3: Voice assistant info
- Row 4: What you CAN do
- Row 5: Limitations (what you CAN'T do)

<div>
  <div>Smart & Connected Features</div>
</div>
<div>
  <div><ul><li>Perfect Blend app with 500+ recipes</li><li>Guided step-by-step instructions</li><li>Auto-detect container size</li><li>Wireless timer sync</li></ul></div>
</div>
<div>
  <div>Works with Alexa for recipe suggestions. No direct blender control via voice (safety feature).</div>
</div>
<div>
  <div><ul><li>Browse recipes on your phone</li><li>Send recipes to the blender display</li><li>Track nutrition and usage</li><li>Get timer notifications</li></ul></div>
</div>
<div>
  <div><ul><li>Cannot start/stop blender remotely</li><li>Cannot adjust speed via app during blend</li><li>Requires WiFi (no offline mode)</li></ul></div>
</div>`,

    'engineering-specs': `
## HTML Template (technical specifications):
Generate raw technical data for spec-focused users. Structure:
- Row 1: Title/product name
- Rows 2+: Spec label | Value | Notes

<div>
  <div>Technical Specifications - Ascent A3500</div>
</div>
<div>
  <div>Motor Power</div>
  <div>2.2 HP (continuous)</div>
  <div>Peak: 3.2 HP</div>
</div>
<div>
  <div>Motor Type</div>
  <div>Radial cooling fan motor</div>
  <div>All-metal drive socket</div>
</div>
<div>
  <div>Max RPM</div>
  <div>24,000 RPM</div>
  <div>No-load blade speed</div>
</div>
<div>
  <div>Sound Level</div>
  <div>88 dBA</div>
  <div>Measured at 1m, max speed</div>
</div>
<div>
  <div>Container Material</div>
  <div>Tritan copolyester</div>
  <div>BPA-free, shatter-resistant</div>
</div>
<div>
  <div>Blade Assembly</div>
  <div>Stainless steel, 4-point</div>
  <div>Laser-cut, hardened</div>
</div>
<div>
  <div>Warranty</div>
  <div>10 years</div>
  <div>Full coverage, includes shipping</div>
</div>`,

    'noise-context': `
## HTML Template (real-world noise comparisons):
Generate honest noise comparisons. Structure:
- Row 1: Title
- Rows 2+: Item/model | dB level | Comparison context

<div>
  <div>Real-World Noise Comparison</div>
</div>
<div>
  <div>Normal conversation</div>
  <div>60 dB</div>
  <div>Easy to talk over</div>
</div>
<div>
  <div>Vacuum cleaner</div>
  <div>75 dB</div>
  <div>Noticeable but brief</div>
</div>
<div>
  <div>Vitamix (low speed)</div>
  <div>78 dB</div>
  <div>Like a loud vacuum</div>
</div>
<div>
  <div>Vitamix (high speed)</div>
  <div>88 dB</div>
  <div>Like a motorcycle at 25ft</div>
</div>
<div>
  <div>Vitamix ONE (quietest)</div>
  <div>82 dB</div>
  <div>Noticeably quieter</div>
</div>`,

    'allergen-safety': `
## HTML Template (cross-contamination protocols):
Generate allergen safety content. Structure:
- Row 1: Title
- Row 2: Sanitization protocol
- Row 3: Container strategy
- Row 4: Material safety info

<div>
  <div>Allergen Safety Guide</div>
</div>
<div>
  <div><ol><li>Disassemble blade from container</li><li>Wash with hot soapy water (140°F+)</li><li>Rinse thoroughly</li><li>Sanitize: 1 tsp bleach per gallon water, soak 2 min</li><li>Final rinse and air dry</li></ol></div>
</div>
<div>
  <div><p>Dedicated container strategy:</p><ul><li>Container 1: Allergen-free only</li><li>Container 2: Contains allergens</li><li>Color-coded labels recommended</li></ul></div>
</div>
<div>
  <div><ul><li>All containers BPA-free</li><li>Tritan plastic is non-porous</li><li>Stainless steel blades sanitize with heat</li><li>Inspect gaskets for wear regularly</li></ul></div>
</div>`,

    'best-pick': `
## HTML Template - Prominent "Our Top Pick" callout

Generate a visually prominent "Best Pick" recommendation that appears BEFORE comparison tables.
Use the best-matching product based on the user's specific use case.

CRITICAL: THE IMAGE IS REQUIRED!
You MUST include the product image from the context below. Look for the "Image:" field in the product data.
Do NOT output an empty image div. The image URL must be included.

Pick the BEST single product that matches the user's needs. Do NOT list multiple products.

FOR SOUP QUERIES:
- The best pick MUST be a product with Hot Soup Program
- Products with Hot Soup Program: Ascent X3, Ascent X4, Ascent X5, Propel 750, A3500, A2500
- Mention Hot Soup Program in the rationale

FOR SMOOTHIE QUERIES:
- Emphasize variable speed control and power

CTA TEXT MUST BE VALUE-DRIVEN AND PERSONALIZED:
- For smoothie users: "Get the [Product] for Silky Smoothies"
- For soup lovers: "Get the [Product] for Perfect Soups"
- For families: "Perfect for Your Family - Explore the [Product]"
- For budget-conscious: "Best Value - See the [Product]"
- Generic: "See Why We Recommend This"
NEVER use "View on Vitamix", "Learn More", or "View Details"

OUTPUT THIS EXACT STRUCTURE (replace placeholders with actual values from context):
<div class="best-pick-wrapper">
  <div class="best-pick-badge">OUR TOP PICK</div>
  <div class="best-pick-container">
    <div class="best-pick-content">
      <p class="best-pick-eyebrow">BEST FOR [USE CASE FROM QUERY]</p>
      <h2 class="best-pick-headline">[Product Name from Context]</h2>
      <p class="best-pick-rationale">[1-2 sentences explaining WHY this is the best choice for their specific need]</p>
      <div class="best-pick-details">
        <span class="best-pick-price">$[PRICE]</span>
        <span class="best-pick-warranty">[WARRANTY]</span>
      </div>
      <div class="best-pick-cta">
        <a href="[PRODUCT_URL_FROM_CONTEXT]" class="button primary" target="_blank">[VALUE-DRIVEN CTA - e.g., "Get the A3500 for Silky Smoothies"]</a>
      </div>
    </div>
    <div class="best-pick-image">
      <picture><img src="[PRODUCT_IMAGE_URL_FROM_CONTEXT]" alt="[Product Name]"></picture>
    </div>
  </div>
</div>

REMEMBER: The rationale must explain WHY this specific product is best for their query.`,
  };

  return templates[blockType] || '';
}

async function generateBlockContent(
  block: BlockSelection,
  ragContext: RAGContext,
  env: Env,
  preset?: string,
  intent?: IntentClassification,
  query?: string
): Promise<GeneratedBlock> {
  const modelFactory = createModelFactory(env, preset);

  // Build context based on block type
  let dataContext = '';
  let specsTableProductName: string | undefined;

  if (['product-cards', 'product-recommendation', 'comparison-table', 'best-pick'].includes(block.type)) {
    dataContext = `\n\n## Available Products (USE THESE EXACT IMAGE URLs):\n${buildProductContext(ragContext.relevantProducts)}`;
  } else if (['specs-table'].includes(block.type)) {
    // For specs-table, provide the first/main product's specifications
    const mainProduct = ragContext.relevantProducts[0];
    if (mainProduct) {
      dataContext = `\n\n## Product to Display Specs For:\n- ${mainProduct.name}\n- Features: ${mainProduct.features?.join(', ') || 'High performance blending'}\n- Price: $${mainProduct.price}\n\nGenerate realistic specifications based on this product type.`;
      // Store product name for title injection
      specsTableProductName = mainProduct.name;
    }
  } else if (['faq'].includes(block.type)) {
    // For FAQ, get real FAQs from the database based on query
    const queryText = block.contentGuidance || query || '';
    const relevantFAQs = getFAQsForQuery(queryText);
    if (relevantFAQs.length > 0) {
      dataContext = `\n\n## Real FAQs (USE THESE EXACT Q&A PAIRS - do not invent):\n${buildFAQContext(relevantFAQs.slice(0, 6))}`;
    } else {
      // Fallback if no FAQs match - provide product context for general questions
      dataContext = `\n\n## Context:\n- User's question: ${block.contentGuidance}\n- Related products: ${ragContext.relevantProducts.slice(0, 2).map(p => p.name).join(', ')}\n\nGenerate FAQs about Vitamix blender warranty, cleaning, and usage.`;
    }
  } else if (['recipe-cards'].includes(block.type)) {
    dataContext = `\n\n## Available Recipes (USE THESE EXACT IMAGE URLs):\n${buildRecipeContext(ragContext.relevantRecipes)}`;
  } else if (['hero', 'product-hero'].includes(block.type)) {
    // Select hero image based on intent, use cases, and query keywords for variety
    const heroImageUrl = selectHeroImage(
      intent?.intentType,
      intent?.entities?.useCases,
      query
    );
    dataContext = `\n\n## Hero Image (USE THIS EXACT URL): ${heroImageUrl}`;
  } else if (['use-case-cards'].includes(block.type)) {
    dataContext = `\n\n## Use Cases to Highlight:\n${buildUseCaseContext(ragContext.relevantUseCases)}`;
    // Also include products for context
    dataContext += `\n\n## Related Products:\n${buildProductContext(ragContext.relevantProducts.slice(0, 3))}`;
  } else if (['feature-highlights'].includes(block.type)) {
    dataContext = `\n\n## User's Original Question: "${block.contentGuidance}"`;
    dataContext += `\n\n## Use Cases to Highlight:\n${buildUseCaseContext(ragContext.relevantUseCases)}`;
    dataContext += `\n\n## Related Products:\n${buildProductContext(ragContext.relevantProducts.slice(0, 3))}`;
  } else if (['testimonials'].includes(block.type)) {
    // Get real testimonials from content service
    const allReviews = getAllReviews();
    // Prefer chef and customer-story testimonials, then mix in verified purchases
    const chefReviews = allReviews.filter(r => r.sourceType === 'chef');
    const customerStories = allReviews.filter(r => r.sourceType === 'customer-story');
    const verifiedReviews = allReviews.filter(r => r.sourceType === 'bazaarvoice');
    // Select a mix: 2 chef + 1 customer story + 1 verified (or adjust based on availability)
    const selectedReviews = [
      ...chefReviews.slice(0, 2),
      ...customerStories.slice(0, 1),
      ...verifiedReviews.slice(0, 1),
    ].slice(0, 4);
    dataContext = `\n\n## Real Testimonials (USE THESE EXACT QUOTES - do not invent):\n${buildTestimonialContext(selectedReviews)}`;
  } else if (['engineering-specs', 'noise-context'].includes(block.type)) {
    // For technical specs, provide detailed product info
    const mainProduct = ragContext.relevantProducts[0];
    if (mainProduct) {
      dataContext = `\n\n## Product Context:\n- ${mainProduct.name}\n- Price: $${mainProduct.price}\n- Features: ${mainProduct.features?.join(', ') || 'High performance blending'}`;
    }
  } else if (['sustainability-info', 'allergen-safety', 'smart-features'].includes(block.type)) {
    // For informational blocks, provide general context
    dataContext = `\n\n## Related Products:\n${buildProductContext(ragContext.relevantProducts.slice(0, 2))}`;
  } else if (['accessibility-specs'].includes(block.type)) {
    // For accessibility specs, provide multiple products with details for comparison
    dataContext = `\n\n## Products for Accessibility Comparison (USE THESE EXACT URLs):\n${buildProductContext(ragContext.relevantProducts.slice(0, 4))}`;
  }

  // Get HTML template for the block type
  const htmlTemplate = getBlockTemplate(block.type);

  const systemPrompt = `Generate HTML content for a "${block.type}" block.
Content guidance: ${block.contentGuidance}

IMPORTANT RULES:
1. Use ONLY the image URLs provided in the context below - NEVER make up image URLs
2. If no image URL is provided, omit the image element entirely
3. Output valid HTML following the EXACT structure shown in the template
4. Do NOT include <html>, <head>, or <body> tags - just the block content
5. Populate the template with real data from the context provided
${htmlTemplate}
${dataContext}`;

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Generate the ${block.type} block content.
Variant: ${block.variant || 'default'}
Rationale: ${block.rationale}`,
    },
  ];

  try {
    const response = await modelFactory.call('content', messages, env);
    let html = wrapBlockHTML(block.type, response.content, block.variant);

    // For specs-table, add product name as data attribute for client-side title injection
    if (block.type === 'specs-table' && specsTableProductName) {
      // Add data-product-name attribute to the opening div
      html = html.replace(
        /^<div class="specs-table/,
        `<div data-product-name="${specsTableProductName}" class="specs-table`
      );
    }

    return {
      type: block.type,
      html,
      sectionStyle: getSectionStyle(block.type),
    };
  } catch (error) {
    console.error(`[ContentGen] Error generating ${block.type}:`, error instanceof Error ? error.message : error);
    return {
      type: block.type,
      html: `<div class="${block.type}"><p>Content generation failed</p></div>`,
    };
  }
}

function wrapBlockHTML(type: string, content: string, variant?: string): string {
  // Extract just the inner content if wrapped in tags
  let html = content.trim();

  // Strip markdown code fences if LLM included them (handles ``` html, ```html, etc.)
  html = html.replace(/^```\s*html?\s*\n?/i, '').replace(/\n?```\s*$/g, '').trim();

  // If content doesn't start with the block div, wrap it
  if (!html.startsWith(`<div class="${type}`)) {
    const variantClass = variant ? ` ${variant}` : '';
    html = `<div class="${type}${variantClass}">\n${html}\n</div>`;
  }

  return html;
}

function getSectionStyle(blockType: string): string {
  const darkBlocks = ['hero', 'product-hero'];
  const highlightBlocks = ['reasoning', 'reasoning-user', 'testimonials', 'recipe-cards'];
  const accentBlocks = ['best-pick'];

  if (darkBlocks.includes(blockType)) return 'dark';
  if (highlightBlocks.includes(blockType)) return 'highlight';
  if (accentBlocks.includes(blockType)) return 'accent';
  return 'default';
}

// ============================================
// Context Extraction Helpers
// ============================================

/**
 * Extract product names from generated block HTML for session context
 */
function extractProductNamesFromBlocks(blocks: GeneratedBlock[]): string[] {
  const products: string[] = [];
  const productBlocks = blocks.filter(b =>
    ['product-cards', 'product-recommendation', 'comparison-table', 'accessibility-specs'].includes(b.type)
  );

  for (const block of productBlocks) {
    // Extract from product-name class
    const nameMatches = block.html.match(/class="product-name"[^>]*>(?:<a[^>]*>)?([^<]+)/g);
    if (nameMatches) {
      for (const match of nameMatches) {
        const name = match.replace(/class="product-name"[^>]*>(?:<a[^>]*>)?/, '').trim();
        if (name && !products.includes(name)) {
          products.push(name);
        }
      }
    }

    // Extract from product-recommendation-headline (h2)
    const headlineMatches = block.html.match(/class="product-recommendation-headline"[^>]*>([^<]+)/g);
    if (headlineMatches) {
      for (const match of headlineMatches) {
        const name = match.replace(/class="product-recommendation-headline"[^>]*>/, '').trim();
        if (name && !products.includes(name)) {
          products.push(name);
        }
      }
    }

    // Extract from h2/h3 headings (product cards use h3, recommendations use h2)
    const headingMatches = block.html.match(/<h[23][^>]*>(?:<a[^>]*>)?([^<]+)/g);
    if (headingMatches) {
      for (const match of headingMatches) {
        const name = match.replace(/<h[23][^>]*>(?:<a[^>]*>)?/, '').trim();
        // Filter out generic headings
        if (name && !products.includes(name) &&
            !name.includes('Specifications') &&
            !name.includes('Continue') &&
            !name.includes('Tips')) {
          products.push(name);
        }
      }
    }

    // Extract from comparison table headers (columnheader with product names)
    const thMatches = block.html.match(/<(?:th|columnheader)[^>]*>(?:<[^>]*>)*([A-Z][a-zA-Z0-9\s]+)(?:<\/[^>]*>)*<\/(?:th|columnheader)>/g);
    if (thMatches) {
      for (const match of thMatches) {
        // Extract just the text content
        const textMatch = match.match(/>([A-Z][a-zA-Z0-9\s]+)</);
        if (textMatch) {
          const name = textMatch[1].trim();
          if (name && !products.includes(name) && name.length > 2 &&
              !['Price', 'Weight', 'Controls', 'Model', 'Lid'].includes(name)) {
            products.push(name);
          }
        }
      }
    }
  }

  return products.slice(0, 5); // Limit to top 5
}

/**
 * Extract recipe names from generated block HTML for session context
 */
function extractRecipeNamesFromBlocks(blocks: GeneratedBlock[]): string[] {
  const recipes: string[] = [];
  const recipeBlocks = blocks.filter(b => b.type === 'recipe-cards');

  for (const block of recipeBlocks) {
    // Extract from recipe-card-title class or h4 headings
    const titleMatches = block.html.match(/class="recipe-card-title"[^>]*>([^<]+)/g);
    if (titleMatches) {
      for (const match of titleMatches) {
        const name = match.replace(/class="recipe-card-title"[^>]*>/, '').trim();
        if (name && !recipes.includes(name)) {
          recipes.push(name);
        }
      }
    }

    // Also try h4 headings
    const h4Matches = block.html.match(/<h4[^>]*>([^<]+)/g);
    if (h4Matches) {
      for (const match of h4Matches) {
        const name = match.replace(/<h4[^>]*>/, '').trim();
        if (name && !recipes.includes(name)) {
          recipes.push(name);
        }
      }
    }
  }

  return recipes.slice(0, 5); // Limit to top 5
}

// ============================================
// Reasoning User Block Generation (Empathetic, User-Focused)
// ============================================

function generateReasoningUserBlock(reasoningResult: ReasoningResult): GeneratedBlock {
  const reasoning = reasoningResult.reasoning;

  // Transform the reasoning content into user-focused, empathetic messaging
  const stepsHTML = [
    {
      stage: 'understanding',
      content: reasoning.intentAnalysis,
    },
    {
      stage: 'assessment',
      content: reasoning.userNeedsAssessment,
    },
    {
      stage: 'decision',
      content: reasoning.finalDecision,
    },
  ]
    .map(
      (step) => `
    <div>
      <div>${step.stage}</div>
      <div>
        <p>${step.content}</p>
      </div>
    </div>
  `
    )
    .join('');

  return {
    type: 'reasoning-user',
    html: `
      <div class="reasoning-user">
        <div><div>Here's What I Understand</div></div>
        ${stepsHTML}
      </div>
    `,
    sectionStyle: 'default',
  };
}

// ============================================
// Follow-up Block Generation
// ============================================

function generateFollowUpBlock(userJourney: ReasoningResult['userJourney']): GeneratedBlock {
  const suggestionsHTML = userJourney.suggestedFollowUps
    .map((suggestion) => `<div><div>${suggestion}</div></div>`)
    .join('');

  return {
    type: 'follow-up',
    html: `
      <div class="follow-up">
        ${suggestionsHTML}
      </div>
    `,
    sectionStyle: 'default',
  };
}

// ============================================
// Main Orchestrator
// ============================================

export async function orchestrate(
  query: string,
  slug: string,
  env: Env,
  onEvent: SSECallback,
  sessionContext?: SessionContext,
  preset?: string
): Promise<{
  blocks: GeneratedBlock[];
  reasoning: ReasoningResult;
  duration: number;
}> {
  const startTime = Date.now();
  const ctx: OrchestrationContext = { query, slug };

  try {
    // Stage 1: Emit start event
    onEvent({
      event: 'generation-start',
      data: { query, estimatedBlocks: 5 },
    });

    // Stage 2: Fast intent classification
    ctx.intent = await classifyIntent(query, env, sessionContext, preset);

    // Stage 3: Get RAG context
    ctx.ragContext = await getRAGContext(query, ctx.intent, env);

    // Stage 4: Deep reasoning (model depends on preset)
    const effectivePreset = preset || env.MODEL_PRESET || 'production';
    const reasoningModel = effectivePreset === 'all-cerebras' ? 'cerebras-gpt-oss-120b' : 'claude-opus-4-5';
    onEvent({
      event: 'reasoning-start',
      data: { model: reasoningModel, preset: effectivePreset },
    });

    ctx.reasoningResult = await analyzeAndSelectBlocks(
      query,
      ctx.intent,
      ctx.ragContext,
      env,
      sessionContext,
      preset
    );

    // Stream reasoning steps
    const reasoningDisplay = formatReasoningForDisplay(ctx.reasoningResult.reasoning);
    for (const step of reasoningDisplay.steps) {
      onEvent({
        event: 'reasoning-step',
        data: step,
      });
    }

    onEvent({
      event: 'reasoning-complete',
      data: {
        confidence: ctx.reasoningResult.confidence,
        duration: Date.now() - startTime,
      },
    });

    // Stage 5: Generate blocks in parallel
    const blocks: GeneratedBlock[] = [];

    for (const blockSelection of ctx.reasoningResult.selectedBlocks) {
      onEvent({
        event: 'block-start',
        data: { blockType: blockSelection.type, index: blocks.length },
      });

      let block: GeneratedBlock;

      // Special handling for reasoning-user and follow-up blocks
      if (blockSelection.type === 'reasoning-user') {
        block = generateReasoningUserBlock(ctx.reasoningResult);
      } else if (blockSelection.type === 'follow-up') {
        block = generateFollowUpBlock(ctx.reasoningResult.userJourney);
      } else {
        block = await generateBlockContent(blockSelection, ctx.ragContext, env, preset, ctx.intent, ctx.query);
      }

      blocks.push(block);

      onEvent({
        event: 'block-content',
        data: { html: block.html, sectionStyle: block.sectionStyle },
      });

      // Emit rationale for transparency
      onEvent({
        event: 'block-rationale',
        data: { blockType: blockSelection.type, rationale: blockSelection.rationale },
      });
    }

    ctx.generatedBlocks = blocks;

    // Stage 6: Complete - send enriched data for session context
    const duration = Date.now() - startTime;

    // Extract product/recipe names from generated HTML for context persistence
    const extractedProducts = extractProductNamesFromBlocks(blocks);
    const extractedRecipes = extractRecipeNamesFromBlocks(blocks);

    // Debug logging
    console.log('[Orchestrator] Extracted products:', extractedProducts);
    console.log('[Orchestrator] Extracted recipes:', extractedRecipes);
    console.log('[Orchestrator] Block types:', blocks.map(b => b.type));
    console.log('[Orchestrator] Session context received:', sessionContext ? JSON.stringify(sessionContext).slice(0, 500) : 'none');

    onEvent({
      event: 'generation-complete',
      data: {
        totalBlocks: blocks.length,
        duration,
        intent: ctx.intent,
        reasoning: {
          journeyStage: ctx.reasoningResult.userJourney.currentStage,
          confidence: ctx.reasoningResult.confidence,
          nextBestAction: ctx.reasoningResult.userJourney.nextBestAction,
          suggestedFollowUps: ctx.reasoningResult.userJourney.suggestedFollowUps,
        },
        recommendations: {
          products: extractedProducts,
          recipes: extractedRecipes,
          blockTypes: blocks.map(b => b.type),
        },
      },
    });

    return {
      blocks,
      reasoning: ctx.reasoningResult,
      duration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onEvent({
      event: 'error',
      data: { message: errorMessage, code: 'ORCHESTRATION_ERROR' },
    });
    throw error;
  }
}
