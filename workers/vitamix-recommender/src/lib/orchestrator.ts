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
  type RAGContext,
} from '../content/content-service';

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

Output JSON only:
{
  "intentType": "discovery|comparison|product-detail|use-case|specs|reviews|price|recommendation",
  "confidence": 0.0-1.0,
  "entities": {
    "products": ["product names mentioned"],
    "useCases": ["smoothies", "soups", etc.],
    "features": ["self-cleaning", "preset programs", etc.],
    "priceRange": "budget|mid|premium|null"
  },
  "journeyStage": "exploring|comparing|deciding"
}`;

async function classifyIntent(
  query: string,
  env: Env,
  sessionContext?: SessionContext,
  preset?: string
): Promise<IntentClassification> {
  const modelFactory = createModelFactory(env, preset);

  const contextInfo = sessionContext?.queries?.length
    ? `\n\nPrevious queries in this session:\n${sessionContext.queries.map((q) => `- "${q.text}" (${q.intent})`).join('\n')}`
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

function buildProductContext(products: Product[]): string {
  if (!products.length) return 'No products available.';
  return products.map(p => `
- ${p.name} (${p.series})
  Price: $${p.price}
  Image: ${p.images?.primary || 'no-image'}
  URL: ${p.url}
  Tagline: ${p.tagline || p.description?.slice(0, 100) || 'Premium blender'}
  Features: ${p.features?.slice(0, 3).join(', ') || 'High performance blending'}
  Best for: ${p.bestFor?.join(', ') || 'All blending tasks'}
`).join('\n');
}

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

IMPORTANT:
- Wrap everything in a single parent div with class "recipe-cards"
- Make each card a clickable link to the recipe's URL on vitamix.com (use target="_blank")

<div class="recipe-cards">
  <header class="rcheader">
    <h3 class="rctitle">Recipes You Might Love</h3>
    <p class="rcsubtitle">Brief context about why these recipes are shown, if needed.</p>
  </header>
  <a href="EXACT_RECIPE_URL_FROM_CONTEXT" class="recipe-card" target="_blank">
    <div class="recipe-card-image">
      <img src="EXACT_IMAGE_URL_FROM_CONTEXT" alt="Recipe name" loading="lazy">
    </div>
    <div class="recipe-card-content">
      <h4 class="recipe-card-title">Exact Recipe Name From Context</h4>
      <p class="recipe-card-description">Time and difficulty from context.</p>
    </div>
  </a>
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

THEN output 3-4 product cards:
<div class="product-card">
  <a href="EXACT_PRODUCT_URL_FROM_CONTEXT" class="product-card-image" target="_blank">
    <img src="EXACT_IMAGE_URL_FROM_CONTEXT" alt="Product Name" loading="lazy">
  </a>
  <div class="product-card-body">
    <h3 class="product-name"><a href="EXACT_PRODUCT_URL_FROM_CONTEXT" target="_blank">Exact Product Name</a></h3>
    <p class="product-tagline">Brief tagline from context</p>
    <div class="product-price">
      <span class="current-price">$XXX.XX</span>
    </div>
    <a href="EXACT_PRODUCT_URL_FROM_CONTEXT" class="product-cta button" target="_blank">View Details</a>
  </div>
</div>

CRITICAL: The header element MUST be the first thing in your output. Do not skip it.`,

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

CRITICAL: The header element MUST be the first thing in your output. Do not skip it.`,

    'hero': `
## HTML Template (two-column layout: image | content):
IMPORTANT: The hero block expects a row with TWO cells - image cell and content cell.
Do NOT use section, hero-block, hero-content classes - just simple divs.

<div>
  <div>
    <picture>
      <img src="HERO_IMAGE_URL" alt="Hero image">
    </picture>
  </div>
  <div>
    <p>OPTIONAL EYEBROW TEXT</p>
    <h1>Main Headline Here</h1>
    <p>Supporting description text that explains the value proposition.</p>
    <p><a href="#explore" class="button">Explore Now</a></p>
  </div>
</div>`,

    'specs-table': `
## HTML Template (vertical label/value pairs):
Each row has TWO cells: label cell and value cell.
Generate 5-8 key specifications.

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
</div>`,

    'faq': `
## HTML Template (accordion Q&A pairs):
Each row has TWO cells: question cell and answer cell.
Generate 4-6 relevant FAQs.

<div>
  <div>Question text goes here?</div>
  <div>Answer text providing helpful information about the topic.</div>
</div>
<div>
  <div>Another question?</div>
  <div>Another helpful answer.</div>
</div>
<div>
  <div>Third question?</div>
  <div>Third answer with details.</div>
</div>`,

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

IMPORTANT: Product names in the header row MUST be links to their vitamix.com product pages.

<div>
  <div></div>
  <div><strong><a href="EXACT_PRODUCT_A_URL" target="_blank">Product A Name</a></strong></div>
  <div><strong><a href="EXACT_PRODUCT_B_URL" target="_blank">Product B Name</a></strong></div>
</div>
<div>
  <div><strong>Price</strong></div>
  <div>$XXX</div>
  <div>$YYY</div>
</div>
<div>
  <div><strong>Motor</strong></div>
  <div>2.2 HP</div>
  <div>2.0 HP</div>
</div>
<!-- Add more spec rows as needed -->`,

    'product-recommendation': `
## HTML Template - IMPORTANT: Generate ONE primary product recommendation.
Pick the BEST single product that matches the user's needs. Do NOT list multiple products.

Structure: Wrap everything in a single div with class "product-recommendation".
First child is the image, second child is the content.

<div class="product-recommendation">
  <div class="product-recommendation-image">
    <picture><img src="EXACT_PRODUCT_IMAGE_URL" alt="Product Name"></picture>
  </div>
  <div class="product-recommendation-content">
    <p class="product-recommendation-eyebrow">BEST FOR [USE CASE]</p>
    <h2 class="product-recommendation-headline">Product Name</h2>
    <p class="product-recommendation-body">Why this specific product is the best choice for the user's needs. Be specific about features that match their requirements.</p>
    <div class="product-recommendation-price">
      <span class="price">$XXX.XX</span>
      <span class="price-note">10-Year Warranty</span>
    </div>
    <div class="product-recommendation-ctas">
      <a href="EXACT_PRODUCT_URL" class="button primary" target="_blank">Shop Now</a>
    </div>
  </div>
</div>`,

    'cta': `
## HTML Template (simple call-to-action):
<div>
  <div>
    <h2>Headline Text</h2>
    <p>Supporting description text.</p>
    <p><a href="#" class="button primary">Primary CTA</a></p>
    <p><a href="#" class="button secondary">Secondary CTA</a></p>
  </div>
</div>`,
  };

  return templates[blockType] || '';
}

async function generateBlockContent(
  block: BlockSelection,
  ragContext: RAGContext,
  env: Env,
  preset?: string
): Promise<GeneratedBlock> {
  const modelFactory = createModelFactory(env, preset);

  // Build context based on block type
  let dataContext = '';
  if (['product-cards', 'product-recommendation', 'comparison-table'].includes(block.type)) {
    dataContext = `\n\n## Available Products (USE THESE EXACT IMAGE URLs):\n${buildProductContext(ragContext.relevantProducts)}`;
  } else if (['specs-table'].includes(block.type)) {
    // For specs-table, provide the first/main product's specifications
    const mainProduct = ragContext.relevantProducts[0];
    if (mainProduct) {
      dataContext = `\n\n## Product to Display Specs For:\n- ${mainProduct.name}\n- Features: ${mainProduct.features?.join(', ') || 'High performance blending'}\n- Price: $${mainProduct.price}\n\nGenerate realistic specifications based on this product type.`;
    }
  } else if (['faq'].includes(block.type)) {
    // For FAQ, provide context about the query and products
    dataContext = `\n\n## Context for FAQ:\n- User's question: ${block.contentGuidance}\n- Related products: ${ragContext.relevantProducts.slice(0, 2).map(p => p.name).join(', ')}\n\nGenerate FAQs that would help answer common questions related to this topic.`;
  } else if (['recipe-cards'].includes(block.type)) {
    dataContext = `\n\n## Available Recipes (USE THESE EXACT IMAGE URLs):\n${buildRecipeContext(ragContext.relevantRecipes)}`;
  } else if (['hero', 'product-hero'].includes(block.type)) {
    // For hero, use first product image or a generic one
    const heroProduct = ragContext.relevantProducts[0];
    if (heroProduct?.images?.primary) {
      dataContext = `\n\n## Hero Image (USE THIS EXACT URL): ${heroProduct.images.primary}`;
    }
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
    return {
      type: block.type,
      html: wrapBlockHTML(block.type, response.content, block.variant),
      sectionStyle: getSectionStyle(block.type),
    };
  } catch (error) {
    console.error(`Error generating ${block.type}:`, error);
    return {
      type: block.type,
      html: `<div class="${block.type}"><p>Content generation failed</p></div>`,
    };
  }
}

function wrapBlockHTML(type: string, content: string, variant?: string): string {
  // Extract just the inner content if wrapped in tags
  let html = content.trim();

  // If content doesn't start with the block div, wrap it
  if (!html.startsWith(`<div class="${type}`)) {
    const variantClass = variant ? ` ${variant}` : '';
    html = `<div class="${type}${variantClass}">\n${html}\n</div>`;
  }

  return html;
}

function getSectionStyle(blockType: string): string {
  const darkBlocks = ['hero', 'product-hero', 'cta'];
  const highlightBlocks = ['reasoning', 'reasoning-user', 'testimonials'];

  if (darkBlocks.includes(blockType)) return 'dark';
  if (highlightBlocks.includes(blockType)) return 'highlight';
  return 'default';
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
    const reasoningModel = effectivePreset === 'all-cerebras' ? 'cerebras-llama-3.3-70b' : 'claude-opus-4-5';
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
        block = await generateBlockContent(blockSelection, ctx.ragContext, env, preset);
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

    // Stage 6: Complete
    const duration = Date.now() - startTime;
    onEvent({
      event: 'generation-complete',
      data: { totalBlocks: blocks.length, duration },
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
