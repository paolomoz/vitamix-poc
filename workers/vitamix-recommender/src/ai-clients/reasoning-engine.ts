/**
 * Reasoning Engine - Claude Opus-powered intent analysis and block selection
 *
 * This module handles the high-level reasoning:
 * - Deep intent analysis
 * - User needs assessment
 * - Dynamic block selection with rationale
 * - User journey planning
 */

import type {
  Env,
  IntentClassification,
  SessionContext,
  ReasoningResult,
  ReasoningTrace,
  BlockSelection,
  BlockType,
  UserJourneyPlan,
} from '../types';
import type { RAGContext } from '../content/content-service';
import { ModelFactory, type Message } from './model-factory';

// ============================================
// Reasoning System Prompt
// ============================================

const REASONING_SYSTEM_PROMPT = `You are the reasoning engine for a Vitamix Blender Recommender.

Your role is to:
1. Deeply analyze user intent and needs
2. Plan an optimal user journey
3. Select which content blocks best serve the user
4. Explain your thinking transparently

CRITICAL - Your reasoning will be shown directly to users. Write like you're talking to them:
- Use "you" and "your" - speak directly to them
- Keep it SHORT: each reasoning field must be under 50 words
- Be warm, friendly, and conversational - like a helpful friend
- NO technical jargon, NO bullet points, NO numbered lists
- Focus on understanding and helping, not analyzing
- Example tone: "You're looking for a blender that can handle your morning smoothies. I've got you covered!"

## Available Blocks

| Block | Purpose |
|-------|---------|
| hero | Full-width banner with headline and image - for landing/discovery |
| product-hero | Product-focused hero with image and specs - for product detail |
| product-cards | Grid of 3-4 product cards - for browsing products |
| recipe-cards | Grid of 3-4 recipe cards - for inspiration |
| comparison-table | Side-by-side product comparison - for comparing models |
| specs-table | Technical specifications table - for detail-oriented users |
| product-recommendation | Featured product with full details - for final recommendation |
| feature-highlights | Key features showcase - for use-case exploration |
| use-case-cards | Use case selection grid - for discovery |
| testimonials | Customer reviews - for social proof |
| faq | Common questions - for support |
| follow-up | Suggestion chips for next actions (always include at end) |
| cta | Call-to-action button - for conversion |
| quick-answer | Simple direct answer - for yes/no questions or quick confirmations |
| support-triage | Help frustrated customers - for product issues/warranty |
| budget-breakdown | Price/value transparency - for budget-conscious users |
| accessibility-specs | Physical/ergonomic specs - for mobility/accessibility concerns |
| empathy-hero | Warm, acknowledging hero - for medical/emotional situations |
| sustainability-info | Environmental responsibility - for eco-conscious buyers |
| smart-features | Connected/app capabilities - for tech-forward users |
| engineering-specs | Deep technical data - for engineers/spec-focused buyers |
| noise-context | Real-world noise comparisons - for noise-sensitive users |
| allergen-safety | Cross-contamination protocols - for allergy-concerned users |
| best-pick | Prominent "Best Pick" callout with visual emphasis - ALWAYS use before comparison-table |

## Block Selection Guidelines

1. NEVER include 'reasoning' or 'reasoning-user' blocks - they are not displayed
2. ALWAYS include 'follow-up' block at the end
3. Match blocks to user journey stage:
   - Exploring: hero, use-case-cards, feature-highlights, follow-up
   - Comparing: hero, comparison-table, product-cards, follow-up
   - Deciding: product-hero, product-recommendation, recipe-cards, cta, follow-up

## SPECIAL HANDLING RULES (CRITICAL - Follow These First!)

### 1. Support/Frustrated Customer Detection
Keywords: "problem", "broken", "frustrated", "warranty", "return", "issue", "not working", "third container"
- ALWAYS lead with support-triage block
- NEVER show product recommendations to frustrated customers
- Prioritize empathy and resolution over sales
- Block sequence: support-triage, faq, follow-up

### 2. Simple Yes/No or Quick Questions
Keywords: "can vitamix", "will it", "does it", "is it worth", "should I", "can I"
- Lead with quick-answer block for direct confirmation
- Use for questions that can be answered simply
- Block sequence: quick-answer, follow-up (add product-recommendation if they need details)

### 3. Medical/Accessibility Queries
Keywords: "arthritis", "disability", "dysphagia", "stroke", "mobility", "grip", "heavy", "aging"
- Lead with empathy-hero to acknowledge their situation
- Include accessibility-specs for physical considerations
- Block sequence: empathy-hero, accessibility-specs, product-recommendation, follow-up

### 4. Budget-Conscious Users
Keywords: "budget", "afford", "cheap", "worth it", "broke", "student", "expensive"
- Include budget-breakdown block prominently
- Be honest about alternatives
- Block sequence: hero, budget-breakdown, product-cards, follow-up

### 5. Gift Queries
Keywords: "gift", "for my", "birthday", "wedding", "christmas", "present"
- Focus on recipient's needs, not the buyer's expertise
- Offer "safe bet" recommendations
- Surface gift card option
- Block sequence: hero, product-recommendation, product-cards, follow-up

### 5b. Family with Picky Eaters / Kids Queries
Keywords: "picky eater", "picky eaters", "kids", "children", "family of", "son", "daughter", "doesn't like veggies", "won't eat vegetables", "hiding vegetables", "sneak vegetables"
- Lead with empathetic hero acknowledging the parenting challenge
- EMPHASIZE soup-making capabilities as a solution for hiding vegetables
- Highlight that soups can sneak in nutrition without kids noticing
- Include smoothie-making for kids who love them
- Focus on self-cleaning and quick prep for busy parents
- Block sequence: hero (family-focused), feature-highlights (soup + smoothie capabilities), recipe-cards (kid-friendly soups AND smoothies), product-recommendation, follow-up
- Content guidance should mention: "Your Vitamix can make creamy, delicious soups that hide vegetables in plain sight - even green ones! Kids love the smooth texture and won't detect the hidden nutrition."

### 6. Commercial/B2B Queries
Keywords: "restaurant", "business", "commercial", "bulk", "b2b", "professional kitchen"
- Focus on durability, warranty, volume
- Mention commercial support contact
- Block sequence: hero, specs-table, comparison-table, follow-up

### 7. Sustainability/Eco-Conscious Queries
Keywords: "eco", "sustainable", "environment", "green", "waste", "landfill", "plastic", "carbon"
- Include sustainability-info block prominently
- Focus on longevity and repairability as eco-benefits
- Block sequence: hero, sustainability-info, product-recommendation, follow-up

### 8. Noise-Sensitive Users
Keywords: "noise", "quiet", "loud", "apartment", "roommate", "neighbors", "dB", "decibel"
- Include noise-context block with real-world comparisons
- Be honest about limitations - blenders are loud
- Block sequence: hero, noise-context, product-cards, follow-up

### 9. Allergy/Cross-Contamination Concerns
Keywords: "allergy", "allergen", "cross-contamination", "peanut", "gluten", "celiac", "anaphylaxis"
- Include allergen-safety block with cleaning protocols
- Emphasize dedicated container strategy
- Block sequence: hero, allergen-safety, product-recommendation, follow-up

### 10. Smart Home/Tech Integration Queries
Keywords: "app", "wifi", "connected", "smart", "alexa", "voice", "bluetooth", "smart home"
- Include smart-features block with honest assessment
- Be transparent about limitations
- Block sequence: hero, smart-features, comparison-table, follow-up

### 11. Engineering/Deep Specs Queries
Keywords: "wattage", "rpm", "motor", "specs", "specifications", "technical", "engineer"
- Include engineering-specs block - no marketing fluff
- Focus on raw data and measurements
- Block sequence: hero, engineering-specs, comparison-table, follow-up

### 12. Competitor Comparison Queries
Keywords: "blendtec", "ninja", "nutribullet", "kitchenaid", "cuisinart", "breville"
- IMPORTANT: We only have Vitamix data - cannot make direct competitor comparisons
- Acknowledge the competitor honestly in the response
- Focus on Vitamix strengths without false claims about competitors
- Suggest user research competitors separately for fair comparison
- Never fabricate competitor specs or make up comparison data
- Block sequence: hero, feature-highlights (Vitamix strengths), product-recommendation, follow-up

### 13. Vitamix Model Comparison Queries (CRITICAL)
Detection: Query or URL contains:
- "vs" or "versus" with Vitamix model names (e.g., "X5 vs X4", "A3500 vs A2500")
- Multiple Vitamix model identifiers (X5, X4, X3, A3500, A2500, E310, etc.)
- "compare", "difference between", "which is better" with Vitamix models

WHEN COMPARISON IS DETECTED:
- ALWAYS include best-pick block BEFORE comparison-table
- ALWAYS include comparison-table block
- The best-pick should highlight the recommended model based on user's use case
- Block sequence: hero, best-pick, comparison-table, product-cards, follow-up

IMPORTANT for soup/hot food queries during comparison:
- The best-pick MUST be a product with Hot Soup Program (A3500, A2500, Propel 750, Ascent X3/X4/X5)
- Add "Hot Soup Program" row to comparison table
- Clearly indicate which models have this feature

## Output Format

Respond with valid JSON only:
{
  "selectedBlocks": [
    {
      "type": "hero",
      "variant": "discovery",
      "priority": 1,
      "rationale": "User is exploring options...",
      "contentGuidance": "Focus on empowering headline about possibilities..."
    }
  ],
  "reasoning": {
    "intentAnalysis": "You're looking for... (UNDER 50 WORDS, speak directly to user with 'you')",
    "userNeedsAssessment": "What matters most to you is... (UNDER 50 WORDS, warm and understanding)",
    "blockSelectionRationale": [
      { "blockType": "hero", "reason": "...", "contentFocus": "..." }
    ],
    "alternativesConsidered": ["..."],
    "finalDecision": "Here's my plan for you... (UNDER 50 WORDS, helpful and confident)"
  },
  "userJourney": {
    "currentStage": "exploring",
    "nextBestAction": "explore_use_cases",
    "suggestedFollowUps": ["What can I make with a Vitamix?", "Compare top models"]
  },
  "confidence": 0.92
}

## CRITICAL: Follow-up Suggestion Guidelines

suggestedFollowUps MUST:
1. Be contextually relevant to BOTH the current query AND products/content shown
2. Offer BOTH directions when appropriate:
   - NARROWING: "Tell me more about [specific product shown]", "Compare the top 2 options"
   - BROADENING: "What other use cases work for me?", "Show me budget alternatives"
3. Reference session context when available:
   - "Back to comparing A3500 vs E310" (if they've seen these)
   - "More recipes like [previous recipe shown]"
4. Be phrased as natural questions or prompts users would actually ask
5. NEVER include purchase-intent language:
   - NO: "Buy now", "Add to cart", "Shop now", "Purchase", "Checkout"
   - YES: "View details", "Learn more", "Explore options", "See full specs"

Example good follow-ups:
- "What makes the A3500 worth the extra cost?"
- "Show me recipes I can make with this blender"
- "Compare this with budget options"
- "Tell me about the warranty"

Example BAD follow-ups (never use):
- "Buy the A3500 now"
- "Add to cart"
- "Shop now"`;

// ============================================
// Comparison Detection Helpers
// ============================================

/**
 * Detect if query is asking for a Vitamix model comparison
 */
function detectComparisonQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // Check for explicit comparison keywords
  const comparisonKeywords = [
    /\bvs\b/,
    /\bversus\b/,
    /\bcompare\b/,
    /\bcomparison\b/,
    /\bdifference between\b/,
    /\bwhich is better\b/,
    /\bwhich one\b/,
    /\bshould i choose\b/,
    /\bshould i get\b/,
  ];

  const hasComparisonKeyword = comparisonKeywords.some((pattern) => pattern.test(lowerQuery));

  // Check for multiple Vitamix model identifiers
  const modelPatterns = [
    /\bx5\b/gi,
    /\bx4\b/gi,
    /\bx3\b/gi,
    /\bx2\b/gi,
    /\ba3500\b/gi,
    /\ba2500\b/gi,
    /\ba2300\b/gi,
    /\be310\b/gi,
    /\be320\b/gi,
    /\bpropel\b/gi,
    /\bexplorian\b/gi,
    /\bascent\b/gi,
  ];

  const modelMatches = modelPatterns.filter((pattern) => pattern.test(lowerQuery));
  const hasMultipleModels = modelMatches.length >= 2;

  return hasComparisonKeyword || hasMultipleModels;
}

/**
 * Extract comparison details from query for context
 */
function getComparisonDetails(query: string): string {
  const lowerQuery = query.toLowerCase();

  const modelMatches: string[] = [];
  const modelPatterns: [RegExp, string][] = [
    [/\bx5\b/gi, 'Ascent X5'],
    [/\bx4\b/gi, 'Ascent X4'],
    [/\bx3\b/gi, 'Ascent X3'],
    [/\bx2\b/gi, 'Ascent X2'],
    [/\ba3500\b/gi, 'A3500'],
    [/\ba2500\b/gi, 'A2500'],
    [/\ba2300\b/gi, 'A2300'],
    [/\be310\b/gi, 'E310'],
    [/\be320\b/gi, 'E320'],
    [/\bpropel\s*750\b/gi, 'Propel 750'],
  ];

  for (const [pattern, name] of modelPatterns) {
    if (pattern.test(lowerQuery)) {
      modelMatches.push(name);
    }
  }

  if (modelMatches.length > 0) {
    return `Models mentioned: ${modelMatches.join(' vs ')}`;
  }

  return 'General comparison request';
}

// ============================================
// Reasoning Engine Functions
// ============================================

/**
 * Build the reasoning prompt with context
 */
function buildReasoningPrompt(
  query: string,
  intent: IntentClassification,
  ragContext: RAGContext,
  sessionContext?: SessionContext
): string {
  const productContext = ragContext.relevantProducts
    .slice(0, 5)
    .map((p) => `- ${p.name} (${p.series}): $${p.price} - ${p.tagline || (p.description?.slice(0, 100) ?? '')}`)
    .join('\n');

  const recipeContext = ragContext.relevantRecipes
    .slice(0, 3)
    .map((r) => `- ${r.name}: ${r.category} - ${r.time || r.prepTime || 'quick'} prep`)
    .join('\n');

  const useCaseContext = ragContext.relevantUseCases
    .map((uc) => `- ${uc.name}: ${uc.description}`)
    .join('\n');

  const personaContext = ragContext.detectedPersona
    ? `Detected Persona: ${ragContext.detectedPersona.name}
  - Goals: ${ragContext.detectedPersona.primaryGoals.join(', ')}
  - Concerns: ${ragContext.detectedPersona.keyBarriers.join(', ')}`
    : 'No specific persona detected';

  const sessionHistory = sessionContext?.previousQueries
    ?.slice(-3)
    .map((q) => `  - "${q.query}" (${q.intent})`)
    .join('\n') || 'New session';

  // Get last query's enriched context for conversational flow
  const lastQuery = sessionContext?.previousQueries?.slice(-1)[0];
  const lastQueryContext = lastQuery ? `
## Last Query Context (IMPORTANT for conversational flow)
- Query: "${lastQuery.query}"
- Journey Stage: ${lastQuery.journeyStage || 'exploring'}
- Confidence: ${lastQuery.confidence || 0.5}
- Products Shown: ${lastQuery.recommendedProducts?.join(', ') || 'None'}
- Recipes Shown: ${lastQuery.recommendedRecipes?.join(', ') || 'None'}
- Blocks Used: ${lastQuery.blockTypes?.join(', ') || 'None'}
- Next Best Action Suggested: ${lastQuery.nextBestAction || 'None'}` : '';

  return `## User Query
"${query}"

## Intent Classification
- Type: ${intent.intentType}
- Confidence: ${intent.confidence}
- Journey Stage: ${intent.journeyStage}
- Detected Products: ${intent.entities?.products?.join(', ') || 'None'}
- Use Cases: ${intent.entities?.useCases?.join(', ') || 'None'}
- Features: ${intent.entities?.features?.join(', ') || 'None'}

## User Profile Analysis
${personaContext}

## Available Products (${ragContext.contentSummary.productCount} total)
${productContext || 'No products matched'}

## Relevant Use Cases
${useCaseContext || 'No specific use cases matched'}

## Available Recipes (${ragContext.contentSummary.recipeCount} total)
${recipeContext || 'No recipes matched'}

## Session History
${sessionHistory}
${lastQueryContext}

## User Profile
${sessionContext?.profile ? JSON.stringify(sessionContext.profile, null, 2) : 'No profile data'}

${detectComparisonQuery(query) ? `
## COMPARISON QUERY DETECTED (MANDATORY BLOCKS)
This query is asking for a Vitamix model comparison. You MUST include:
1. best-pick block - Highlight the recommended model BEFORE the comparison
2. comparison-table block - Side-by-side comparison of the models
Block sequence: hero, best-pick, comparison-table, product-cards, follow-up

Detected comparison elements: ${getComparisonDetails(query)}
` : ''}

## Your Task
Analyze this query deeply and select the optimal blocks to render.
Include your reasoning so users understand how you approached their question.
Consider the user's journey stage and what would move them closer to a confident decision.

## CRITICAL: Conversational Flow Detection
If there's a Last Query Context above, determine the conversation flow:

1. **NARROWING** (user drilling down): Keywords like "which is best", "the best one", "tell me more about X", "just one"
   - If high confidence (>0.8) on a single product: Use product-recommendation block
   - If moderate confidence: Use comparison-table with filtered options
   - Reference previously shown products in your reasoning

2. **EXPANDING** (user wants alternatives): Keywords like "what else", "other options", "not sure", "different", "more"
   - Show different products than last time
   - Add a follow-up like "Back to comparing [previous products] →"
   - Acknowledge they've already seen certain options

3. **NEW_TOPIC** (unrelated query): Completely different intent/topic
   - Treat as fresh query but keep user preferences in mind
   - Don't reference previous products unless relevant

**Follow-up chip rules:**
- If NARROWING: "View this model on Vitamix →", "See full specs →", "Find recipes for this →"
- If EXPANDING: "Back to comparing X vs Y →", "Try a different approach →"
- Always make one follow-up reference what they saw before
- NEVER use purchase language like "Buy", "Add to cart", "Shop now"`;
}

/**
 * Parse the reasoning response from the model
 */
function parseReasoningResponse(content: string): ReasoningResult {
  // Extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No valid JSON found in reasoning response');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.selectedBlocks || !Array.isArray(parsed.selectedBlocks)) {
      throw new Error('Missing or invalid selectedBlocks');
    }
    if (!parsed.reasoning) {
      throw new Error('Missing reasoning');
    }
    if (!parsed.userJourney) {
      throw new Error('Missing userJourney');
    }

    return {
      selectedBlocks: parsed.selectedBlocks,
      reasoning: parsed.reasoning,
      userJourney: parsed.userJourney,
      confidence: parsed.confidence || 0.8,
    };
  } catch (e) {
    throw new Error(`Failed to parse reasoning JSON: ${e}`);
  }
}

/**
 * Normalize block type names - remove common suffixes the AI might add
 */
function normalizeBlockType(type: string): string {
  // Map common AI variations to correct block names
  const blockNameMap: Record<string, string> = {
    'hero-block': 'hero',
    'faq-block': 'faq',
    'reasoning': 'reasoning-user', // Always use the user-focused reasoning block
  };

  return blockNameMap[type] || type;
}

/**
 * Ensure required blocks are present
 */
function ensureRequiredBlocks(blocks: BlockSelection[]): BlockSelection[] {
  // Normalize block type names first
  blocks = blocks.map(block => ({
    ...block,
    type: normalizeBlockType(block.type) as BlockSelection['type'],
  }));
  // Filter out any reasoning blocks - they should never be included
  blocks = blocks.filter((b) => b.type !== 'reasoning' && b.type !== 'reasoning-user');

  const hasFollowUp = blocks.some((b) => b.type === 'follow-up');

  // Add follow-up at end if missing
  if (!hasFollowUp) {
    blocks.push({
      type: 'follow-up',
      priority: blocks.length + 1,
      rationale: 'Enable continued exploration',
      contentGuidance: 'Provide contextual follow-up suggestions',
    });
  }

  // Re-assign priorities
  return blocks.map((block, index) => ({
    ...block,
    priority: index + 1,
  }));
}

/**
 * Main reasoning function - analyzes intent and selects blocks
 */
export async function analyzeAndSelectBlocks(
  query: string,
  intent: IntentClassification,
  ragContext: RAGContext,
  env: Env,
  sessionContext?: SessionContext,
  preset?: string
): Promise<ReasoningResult> {
  const modelFactory = new ModelFactory(preset || env.MODEL_PRESET || 'production');

  // Debug: Log session context
  const lastQuery = sessionContext?.previousQueries?.slice(-1)[0];
  console.log('[ReasoningEngine] Session context queries:', sessionContext?.previousQueries?.length || 0);
  if (lastQuery) {
    console.log('[ReasoningEngine] Last query:', lastQuery.query);
    console.log('[ReasoningEngine] Last query products:', lastQuery.recommendedProducts);
    console.log('[ReasoningEngine] Last query journey stage:', lastQuery.journeyStage);
  }

  const reasoningPrompt = buildReasoningPrompt(query, intent, ragContext, sessionContext);
  // Log if lastQueryContext is present
  console.log('[ReasoningEngine] Has lastQueryContext:', reasoningPrompt.includes('Last Query Context'));

  const messages: Message[] = [
    {
      role: 'system',
      content: REASONING_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: reasoningPrompt,
    },
  ];

  try {
    const response = await modelFactory.call('reasoning', messages, env);
    const result = parseReasoningResponse(response.content);

    // Ensure required blocks are present
    result.selectedBlocks = ensureRequiredBlocks(result.selectedBlocks);

    return result;
  } catch (error) {
    console.error('[ReasoningEngine] Error:', error instanceof Error ? error.message : error);
    // Return fallback result
    return getFallbackReasoningResult(intent);
  }
}

/**
 * Get fallback reasoning result when the model fails
 */
function getFallbackReasoningResult(
  intent: IntentClassification
): ReasoningResult {
  const blocksByIntent: Record<string, BlockType[]> = {
    discovery: ['hero', 'use-case-cards', 'product-cards', 'follow-up'],
    comparison: ['hero', 'comparison-table', 'product-cards', 'follow-up'],
    'product-detail': ['product-hero', 'specs-table', 'recipe-cards', 'follow-up'],
    'use-case': ['hero', 'feature-highlights', 'recipe-cards', 'product-recommendation', 'follow-up'],
    specs: ['hero', 'specs-table', 'comparison-table', 'follow-up'],
    reviews: ['hero', 'testimonials', 'product-recommendation', 'follow-up'],
    price: ['hero', 'budget-breakdown', 'product-cards', 'follow-up'],
    recommendation: ['product-recommendation', 'follow-up'],
    // New intent types
    support: ['support-triage', 'faq', 'follow-up'],
    partnership: ['hero', 'feature-highlights', 'testimonials', 'follow-up'],
    gift: ['hero', 'product-recommendation', 'product-cards', 'follow-up'],
    medical: ['empathy-hero', 'accessibility-specs', 'product-recommendation', 'follow-up'],
    accessibility: ['empathy-hero', 'accessibility-specs', 'product-recommendation', 'follow-up'],
  };

  const blocks = blocksByIntent[intent.intentType] || blocksByIntent.discovery;

  return {
    selectedBlocks: blocks.map((type, index) => ({
      type,
      priority: index + 1,
      rationale: `Default block for ${intent.intentType} intent`,
      contentGuidance: `Generate appropriate ${type} content`,
    })),
    reasoning: {
      intentAnalysis: `User intent classified as ${intent.intentType}`,
      userNeedsAssessment: 'Using default assessment based on intent classification',
      blockSelectionRationale: blocks.map((type) => ({
        blockType: type,
        reason: 'Default selection for intent type',
        contentFocus: 'Standard content approach',
      })),
      alternativesConsidered: ['Fallback mode - no alternatives analyzed'],
      finalDecision: 'Using fallback layout due to reasoning engine error',
    },
    userJourney: {
      currentStage: intent.journeyStage,
      nextBestAction: 'continue_exploration',
      suggestedFollowUps: [
        'Tell me more about Vitamix blenders',
        'What can I make?',
        'Compare models',
      ],
    },
    confidence: 0.6,
  };
}

/**
 * Format reasoning for display in the reasoning block
 */
export function formatReasoningForDisplay(
  reasoning: ReasoningTrace
): {
  steps: { stage: string; title: string; content: string }[];
} {
  return {
    steps: [
      {
        stage: 'understanding',
        title: 'Understanding Your Question',
        content: reasoning.intentAnalysis,
      },
      {
        stage: 'assessment',
        title: 'Assessing Your Needs',
        content: reasoning.userNeedsAssessment,
      },
      {
        stage: 'decision',
        title: 'My Recommendation',
        content: reasoning.finalDecision,
      },
    ],
  };
}
