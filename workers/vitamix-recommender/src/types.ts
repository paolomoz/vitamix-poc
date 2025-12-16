/**
 * Vitamix Recommender Types
 * Core type definitions for the AI-driven recommendation system
 */

// ============================================
// Product Types
// ============================================

export interface Product {
  id: string;
  sku?: string;
  name: string;
  series: string;
  url: string;
  price: number;
  originalPrice?: number | null;
  availability?: 'in-stock' | 'out-of-stock' | 'limited';
  description?: string;
  tagline?: string;
  features?: string[];
  bestFor?: string[];
  warranty?: string;
  specs?: ProductSpecs;
  images?: ProductImages;
  crawledAt?: string;
  sourceUrl?: string;
  contentHash?: string;
}

export interface ProductSpecs {
  watts: number;
  capacity: string;
  programs: number;
  dimensions?: string;
  weight?: string;
  motorHP?: string;
  containerMaterial?: string;
  bladeType?: string;
}

export interface ProductImages {
  primary: string;
  gallery: string[];
  remoteUrls: string[];
}

// ============================================
// Recipe Types
// ============================================

export interface Recipe {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  description?: string;
  difficulty?: 'easy' | 'medium' | 'advanced';
  time?: string;
  ingredients?: Ingredient[];
  instructions?: string[];
  tips?: string[];
  prepTime?: string;
  blendTime?: string;
  totalTime?: string;
  servings?: number;
  yield?: string;
  nutrition?: NutritionInfo;
  dietaryTags?: string[];
  requiredContainer?: string;
  recommendedProgram?: string;
  blenderSpeed?: string;
  recommendedProducts?: string[];
  requiredFeatures?: string[];
  images?: RecipeImages;
  url?: string;
  crawledAt?: string;
  contentHash?: string;
}

export interface Ingredient {
  item: string;
  quantity: string;
  unit?: string;
  notes?: string;
}

export interface NutritionInfo {
  calories?: number;
  protein?: string;
  carbs?: string;
  fat?: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
}

export interface RecipeImages {
  primary: string;
  steps?: string[];
  remoteUrl: string;
}

// ============================================
// Accessory Types
// ============================================

export interface Accessory {
  id: string;
  name: string;
  type: 'container' | 'tamper' | 'food-processor' | 'immersion-blender' | 'blade' | 'lid' | 'accessory';
  url: string;
  price: number;
  originalPrice?: number | null;
  availability?: 'in-stock' | 'out-of-stock' | 'limited';
  description?: string;
  features?: string[];
  specs?: AccessorySpecs;
  compatibility?: AccessoryCompatibility;
  includedItems?: string[];
  images?: ProductImages;
  crawledAt?: string;
  sourceUrl?: string;
}

export interface AccessorySpecs {
  capacity?: string;
  dimensions?: string;
  weight?: string;
  material?: string;
  dishwasherSafe?: boolean;
  bpaFree?: boolean;
}

export interface AccessoryCompatibility {
  series?: string[];
  machines?: string[];
  selfDetect?: boolean;
}

// ============================================
// Use Case Types
// ============================================

export interface UseCase {
  id: string;
  name: string;
  description: string;
  icon: string;
  relevantFeatures: string[];
  recommendedSeries: string[];
  difficultyLevel?: string;
  timeInvestment?: string;
  popularRecipes?: string[];
}

// ============================================
// Feature Types
// ============================================

export interface Feature {
  id: string;
  name: string;
  description: string;
  benefit: string;
  availableIn: string[];
}

// ============================================
// Review Types
// ============================================

export interface Review {
  id: string;
  productId?: string;
  author: string;
  authorTitle?: string;
  rating?: number;
  title?: string;
  content: string;
  verifiedPurchase?: boolean;
  useCase?: string;
  date?: string;
  sourceUrl?: string;
  sourceType?: 'bazaarvoice' | 'editorial' | 'chef' | 'customer-story' | 'third-party';
}

// ============================================
// User Persona Types
// ============================================

export interface UserPersona {
  personaId: string;
  name: string;
  demographics: {
    householdType: string;
    typicalAge?: string;
    timeAvailability: string;
    cookingSkill: string;
  };
  primaryGoals: string[];
  keyBarriers: string[];
  emotionalState: {
    frustrations: string[];
    hopes: string[];
    fears: string[];
  };
  productPriorities: { attribute: string; importance: string }[];
  effectiveMessaging: {
    validationPhrases: string[];
    benefitEmphasis: string[];
    proofPoints: string[];
    visualizations: string[];
  };
  triggerPhrases: string[];
  recommendedProducts: string[];
}

// ============================================
// Product Profile Types
// ============================================

export interface ProductProfile {
  useCaseScores: Record<string, number>;
  priceTier: 'budget' | 'mid' | 'premium';
  householdFit: ('solo' | 'couple' | 'family')[];
  standoutFeatures: string[];
  notIdealFor: string[];
}

// ============================================
// Intent & Classification Types
// ============================================

export interface IntentClassification {
  intentType: IntentType;
  confidence: number;
  entities: {
    products: string[];
    useCases: string[];
    features: string[];
    priceRange?: string;
    ingredients?: string[];  // Ingredient terms detected in query
  };
  journeyStage: JourneyStage;
}

export type IntentType =
  | 'discovery'
  | 'comparison'
  | 'product-detail'
  | 'use-case'
  | 'specs'
  | 'reviews'
  | 'price'
  | 'recommendation'
  | 'support'        // Product issues, warranty, returns
  | 'partnership'    // Affiliate, creator, B2B inquiries
  | 'gift'           // Buying for someone else
  | 'medical'        // Healthcare/therapeutic use
  | 'accessibility'; // Physical limitations focus

// User mode for adapting response style
export type UserMode =
  | 'quick'      // Wants fast answer
  | 'research'   // Wants depth
  | 'gift'       // Buying for others
  | 'support'    // Has a problem
  | 'commercial'; // B2B inquiry

export type JourneyStage = 'exploring' | 'comparing' | 'deciding';

// ============================================
// Block Selection Types
// ============================================

export interface BlockSelection {
  type: BlockType;
  variant?: string;
  priority: number;
  rationale: string;
  contentGuidance: string;
}

export type BlockType =
  | 'hero'
  | 'product-hero'
  | 'reasoning'
  | 'reasoning-user'
  | 'product-cards'
  | 'recipe-cards'
  | 'comparison-table'
  | 'specs-table'
  | 'product-recommendation'
  | 'feature-highlights'
  | 'use-case-cards'
  | 'testimonials'
  | 'faq'
  | 'follow-up'
  | 'split-content'
  | 'columns'
  | 'text'
  // New blocks for improved user experience
  | 'quick-answer'        // Simple direct answer for quick questions
  | 'support-triage'      // Help frustrated customers
  | 'budget-breakdown'    // Price/value transparency
  | 'accessibility-specs' // Physical/ergonomic specs
  | 'empathy-hero'        // Warm, acknowledging hero variant
  | 'best-pick'           // Prominent "Best Pick" callout before comparisons
  // Phase 2 blocks
  | 'sustainability-info' // Environmental responsibility
  | 'smart-features'      // Connected/app capabilities
  | 'engineering-specs'   // Deep technical specifications
  | 'noise-context'       // Real-world noise comparisons
  | 'allergen-safety';    // Cross-contamination protocols

// ============================================
// Reasoning Types
// ============================================

export interface ReasoningResult {
  selectedBlocks: BlockSelection[];
  reasoning: ReasoningTrace;
  userJourney: UserJourneyPlan;
  confidence: number;
}

export interface ReasoningTrace {
  intentAnalysis: string;
  userNeedsAssessment: string;
  blockSelectionRationale: BlockRationale[];
  alternativesConsidered: string[];
  finalDecision: string;
}

export interface BlockRationale {
  blockType: BlockType;
  reason: string;
  contentFocus: string;
}

export interface UserJourneyPlan {
  currentStage: JourneyStage;
  nextBestAction: string;
  suggestedFollowUps: string[];
}

// ============================================
// Session Context Types
// ============================================

export interface SessionContext {
  previousQueries: QueryHistoryItem[];
  profile?: UserProfile;
}

export interface QueryHistoryItem {
  query: string;
  intent: string;
  entities?: {
    products: string[];
    ingredients: string[];
    goals: string[];
  };
  // Enriched context fields
  recommendedProducts?: string[];
  recommendedRecipes?: string[];
  blockTypes?: string[];
  journeyStage?: JourneyStage;
  confidence?: number;
  nextBestAction?: string;
}

export interface UserProfile {
  useCases?: string[];
  priceRange?: 'budget' | 'mid' | 'premium';
  productsViewed?: string[];
  concerns?: string[];
  journeyStage: JourneyStage;
}

// ============================================
// RAG Context Types
// ============================================

export interface RAGContext {
  chunks: ContentChunk[];
  products: Product[];
  recipes: Recipe[];
}

export interface ContentChunk {
  id: string;
  text: string;
  metadata: {
    contentType: string;
    pageTitle: string;
    sourceUrl: string;
  };
  score: number;
}

// ============================================
// SSE Event Types
// ============================================

export type SSEEvent =
  | { event: 'generation-start'; data: { query: string; estimatedBlocks: number } }
  | { event: 'reasoning-start'; data: { model: string; preset?: string } }
  | { event: 'reasoning-step'; data: { stage: string; title: string; content: string } }
  | { event: 'reasoning-complete'; data: { confidence: number; duration: number } }
  | { event: 'block-start'; data: { blockType: BlockType; index: number } }
  | { event: 'block-content'; data: { html: string; sectionStyle?: string } }
  | { event: 'block-rationale'; data: { blockType: BlockType; rationale: string } }
  | { event: 'image-ready'; data: { imageId: string; url: string } }
  | { event: 'generation-complete'; data: GenerationCompleteData }
  | { event: 'error'; data: { message: string; code?: string } };

// Enriched generation-complete event data
export interface GenerationCompleteData {
  totalBlocks: number;
  duration: number;
  intent?: IntentClassification;
  reasoning?: {
    journeyStage: JourneyStage;
    confidence: number;
    nextBestAction: string;
    suggestedFollowUps: string[];
  };
  recommendations?: {
    products: string[];
    recipes: string[];
    blockTypes: string[];
  };
}

// ============================================
// Model Configuration Types
// ============================================

export type ModelRole = 'reasoning' | 'content' | 'classification' | 'validation';

export type ModelProvider = 'anthropic' | 'cerebras' | 'google';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelPreset {
  reasoning: ModelConfig;
  content: ModelConfig;
  classification: ModelConfig;
  validation: ModelConfig;
}

// ============================================
// Environment Bindings
// ============================================

export interface Env {
  // AI Services
  ANTHROPIC_API_KEY: string;
  CEREBRAS_API_KEY?: string;
  CEREBRAS_KEY?: string;  // Alternative name used in some deployments
  GOOGLE_API_KEY?: string;

  // Cloudflare Bindings
  AI: Ai;
  VECTORIZE?: VectorizeIndex;
  SESSIONS?: KVNamespace;

  // DA (Document Authoring) Configuration
  DA_ORG: string;
  DA_REPO: string;
  // S2S Authentication (preferred)
  DA_CLIENT_ID?: string;
  DA_CLIENT_SECRET?: string;
  DA_SERVICE_TOKEN?: string;
  // Legacy static token (fallback)
  DA_TOKEN?: string;

  // Configuration
  MODEL_PRESET?: string;
  DEBUG?: string;
}
