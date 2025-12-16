/**
 * Content Service
 *
 * Provides access to local JSON content for products, recipes, use cases,
 * features, reviews, personas, and product profiles.
 *
 * In production, this loads from bundled JSON or KV storage.
 * Content is imported at build time for Cloudflare Workers.
 */

import type {
  Product,
  Recipe,
  UseCase,
  Feature,
  Review,
  UserPersona,
  ProductProfile,
  Accessory,
} from '../types';

// Import content at build time
import productsData from '../../../../content/products/products.json';
import recipesData from '../../../../content/recipes/recipes.json';
import accessoriesData from '../../../../content/accessories/accessories.json';
import useCasesData from '../../../../content/metadata/use-cases.json';
import featuresData from '../../../../content/metadata/features.json';
import reviewsData from '../../../../content/metadata/reviews.json';
import personasData from '../../../../content/metadata/personas.json';
import productProfilesData from '../../../../content/metadata/product-profiles.json';
import recipeAssociationsData from '../../../../content/metadata/recipe-associations.json';
import faqsData from '../../../../content/metadata/faqs.json';

// Type the imported data
interface ProductsFile {
  products: Product[];
}

interface RecipesFile {
  recipes: Recipe[];
  categories: string[];
}

interface UseCasesFile {
  useCases: UseCase[];
}

interface FeaturesFile {
  features: Feature[];
}

interface ReviewsFile {
  reviews: Review[];
}

interface PersonasFile {
  personas: UserPersona[];
}

interface ProductProfilesFile {
  profiles: Record<string, ProductProfile>;
}

interface AccessoriesFile {
  accessories: Accessory[];
}

interface RecipeCategory {
  description: string;
  requiredFeatures: string[];
  optionalFeatures: string[];
  recommendedProducts: string[];
  keywords: string[];
}

interface RecipeAssociationsFile {
  categories: Record<string, RecipeCategory>;
  featureToProducts: Record<string, string[]>;
  difficultyToProducts: Record<string, string[]>;
  servingSizeToProducts: Record<string, string[]>;
}

export interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
}

interface FAQsFile {
  faqs: FAQ[];
}

// Cast imported data
const products = (productsData as ProductsFile).products;
const recipes = (recipesData as RecipesFile).recipes;
const recipeCategories = (recipesData as RecipesFile).categories;
const accessories = (accessoriesData as AccessoriesFile).accessories;
const useCases = (useCasesData as UseCasesFile).useCases;
const features = (featuresData as FeaturesFile).features;
const reviews = (reviewsData as ReviewsFile).reviews;
const personas = (personasData as PersonasFile).personas;
const productProfiles = (productProfilesData as ProductProfilesFile).profiles;
const recipeAssociations = recipeAssociationsData as RecipeAssociationsFile;
const faqs = (faqsData as FAQsFile).faqs;

// ============================================
// Product Queries
// ============================================

export function getAllProducts(): Product[] {
  return products;
}

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getProductsByIds(ids: string[]): Product[] {
  return products.filter((p) => ids.includes(p.id));
}

export function getProductsBySeries(series: string): Product[] {
  return products.filter((p) => p.series === series);
}

export function getProductsByPriceRange(min: number, max: number): Product[] {
  return products.filter((p) => p.price >= min && p.price <= max);
}

export function getProductsByUseCase(useCase: string): Product[] {
  return products.filter((p) => p.bestFor?.includes(useCase));
}

export function searchProducts(query: string): Product[] {
  const lowerQuery = query.toLowerCase();
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description?.toLowerCase().includes(lowerQuery) ||
      p.features?.some((f) => f.toLowerCase().includes(lowerQuery)) ||
      p.bestFor?.some((b) => b.toLowerCase().includes(lowerQuery))
  );
}

// ============================================
// Recipe Queries
// ============================================

export function getAllRecipes(): Recipe[] {
  return recipes;
}

export function getRecipeById(id: string): Recipe | undefined {
  return recipes.find((r) => r.id === id);
}

export function getRecipesByCategory(category: string): Recipe[] {
  return recipes.filter((r) => r.category === category);
}

export function getRecipesByDifficulty(difficulty: string): Recipe[] {
  return recipes.filter((r) => r.difficulty === difficulty);
}

export function getRecipesForProduct(productId: string): Recipe[] {
  return recipes.filter((r) => r.recommendedProducts?.includes(productId));
}

export function getRecipeCategories(): string[] {
  return recipeCategories;
}

/**
 * Search recipes across name, description, and ingredients.
 * Uses score-based ranking for relevance.
 */
export function searchRecipes(query: string, maxResults = 50): Recipe[] {
  const lowerQuery = query.toLowerCase();
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);

  if (queryWords.length === 0) return [];

  const scored = recipes.map(recipe => {
    let score = 0;

    // Name matching (highest weight)
    const lowerName = recipe.name.toLowerCase();
    if (lowerName.includes(lowerQuery)) {
      score += 10; // Exact phrase match in name
    } else {
      for (const word of queryWords) {
        if (lowerName.includes(word)) score += 3;
      }
    }

    // Description matching
    if (recipe.description) {
      const lowerDesc = recipe.description.toLowerCase();
      if (lowerDesc.includes(lowerQuery)) {
        score += 5;
      } else {
        for (const word of queryWords) {
          if (lowerDesc.includes(word)) score += 1;
        }
      }
    }

    // Ingredient matching (key functionality for ingredient-based search)
    if (recipe.ingredients?.length) {
      for (const ingredient of recipe.ingredients) {
        if (!ingredient.item) continue;
        const lowerItem = ingredient.item.toLowerCase();

        // Check if ingredient matches query or query contains ingredient
        if (lowerItem.includes(lowerQuery) || lowerQuery.includes(lowerItem)) {
          score += 8; // Strong match for exact ingredient
        } else {
          for (const word of queryWords) {
            if (lowerItem.includes(word)) score += 4;
          }
        }
      }
    }

    return { recipe, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.recipe);
}

// ============================================
// Use Case & Feature Queries
// ============================================

export function getAllUseCases(): UseCase[] {
  return useCases;
}

export function getUseCaseById(id: string): UseCase | undefined {
  return useCases.find((u) => u.id === id);
}

export function getAllFeatures(): Feature[] {
  return features;
}

export function getFeatureById(id: string): Feature | undefined {
  return features.find((f) => f.id === id);
}

export function getFeaturesForProduct(productId: string): Feature[] {
  return features.filter((f) => f.availableIn?.includes(productId));
}

// ============================================
// Accessory Queries
// ============================================

export function getAllAccessories(): Accessory[] {
  return accessories;
}

export function getAccessoryById(id: string): Accessory | undefined {
  return accessories.find((a) => a.id === id);
}

export function getAccessoriesByType(type: string): Accessory[] {
  return accessories.filter((a) => a.type === type);
}

export function getAccessoriesForSeries(series: string): Accessory[] {
  return accessories.filter((a) =>
    a.compatibility?.series?.some((s) => s.toLowerCase().includes(series.toLowerCase()))
  );
}

export function getContainersForProduct(productId: string): Accessory[] {
  return accessories.filter((a) =>
    a.type === 'container' &&
    (a.compatibility?.machines?.some((m) => m.toLowerCase().includes(productId.toLowerCase())) ||
     a.compatibility?.series?.length)
  );
}

export function searchAccessories(query: string): Accessory[] {
  const lowerQuery = query.toLowerCase();
  return accessories.filter(
    (a) =>
      a.name.toLowerCase().includes(lowerQuery) ||
      a.description?.toLowerCase().includes(lowerQuery) ||
      a.type.toLowerCase().includes(lowerQuery)
  );
}

// ============================================
// Review Queries
// ============================================

export function getAllReviews(): Review[] {
  return reviews;
}

export function getReviewsByProduct(productId: string): Review[] {
  return reviews.filter((r) => r.productId === productId);
}

export function getReviewsByUseCase(useCase: string): Review[] {
  return reviews.filter((r) => r.useCase === useCase);
}

export function getAverageRating(productId: string): number {
  const productReviews = getReviewsByProduct(productId);
  if (productReviews.length === 0) return 0;
  const sum = productReviews.reduce((acc, r) => acc + (r.rating || 0), 0);
  return sum / productReviews.length;
}

// ============================================
// Persona Queries
// ============================================

export function getAllPersonas(): UserPersona[] {
  return personas;
}

export function getPersonaById(id: string): UserPersona | undefined {
  return personas.find((p) => p.personaId === id);
}

export function detectPersona(query: string): UserPersona | null {
  const lowerQuery = query.toLowerCase();

  for (const persona of personas) {
    for (const trigger of persona.triggerPhrases) {
      if (lowerQuery.includes(trigger.toLowerCase())) {
        return persona;
      }
    }
  }

  return null;
}

// ============================================
// Product Profile Queries
// ============================================

export function getProductProfile(productId: string): ProductProfile | undefined {
  return productProfiles[productId];
}

export function getProductsForUseCase(useCase: string, minScore = 7): Product[] {
  const matchingIds = Object.entries(productProfiles)
    .filter(([_, profile]) => {
      const score = profile.useCaseScores?.[useCase];
      return score && score >= minScore;
    })
    .sort(([_a, profileA], [_b, profileB]) => {
      const scoreA = profileA.useCaseScores?.[useCase] ?? 0;
      const scoreB = profileB.useCaseScores?.[useCase] ?? 0;
      return scoreB - scoreA;
    })
    .map(([id]) => id);

  return getProductsByIds(matchingIds);
}

export function getProductsByPriceTier(tier: 'budget' | 'mid' | 'premium'): Product[] {
  const matchingIds = Object.entries(productProfiles)
    .filter(([_, profile]) => profile.priceTier === tier)
    .map(([id]) => id);

  return getProductsByIds(matchingIds);
}

export function getProductsByHouseholdFit(fit: 'solo' | 'couple' | 'family'): Product[] {
  const matchingIds = Object.entries(productProfiles)
    .filter(([_, profile]) => profile.householdFit?.includes(fit))
    .map(([id]) => id);

  return getProductsByIds(matchingIds);
}

// ============================================
// Content Summary (for AI context)
// ============================================

export interface ContentSummary {
  productCount: number;
  recipeCount: number;
  useCaseCount: number;
  featureCount: number;
  priceTiers: {
    budget: { min: number; max: number; count: number };
    mid: { min: number; max: number; count: number };
    premium: { min: number; max: number; count: number };
  };
  series: string[];
  categories: string[];
}

export function getContentSummary(): ContentSummary {
  const budgetProducts = products.filter((p) => p.price < 500);
  const midProducts = products.filter((p) => p.price >= 500 && p.price < 700);
  const premiumProducts = products.filter((p) => p.price >= 700);

  const series = [...new Set(products.map((p) => p.series))];

  return {
    productCount: products.length,
    recipeCount: recipes.length,
    useCaseCount: useCases.length,
    featureCount: features.length,
    priceTiers: {
      budget: {
        min: Math.min(...budgetProducts.map((p) => p.price)),
        max: Math.max(...budgetProducts.map((p) => p.price)),
        count: budgetProducts.length,
      },
      mid: {
        min: Math.min(...midProducts.map((p) => p.price)),
        max: Math.max(...midProducts.map((p) => p.price)),
        count: midProducts.length,
      },
      premium: {
        min: Math.min(...premiumProducts.map((p) => p.price)),
        max: Math.max(...premiumProducts.map((p) => p.price)),
        count: premiumProducts.length,
      },
    },
    series,
    categories: recipeCategories,
  };
}

// ============================================
// Recipe-Product Associations
// ============================================

export function getRecipeCategory(categoryId: string): RecipeCategory | undefined {
  return recipeAssociations.categories[categoryId];
}

export function detectRecipeCategory(text: string): string | null {
  const lowerText = text.toLowerCase();

  for (const [categoryId, category] of Object.entries(recipeAssociations.categories)) {
    for (const keyword of category.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return categoryId;
      }
    }
  }

  return null;
}

export function getProductsForRecipeCategory(categoryId: string): Product[] {
  const category = recipeAssociations.categories[categoryId];
  if (!category) return [];

  return getProductsByIds(category.recommendedProducts);
}

export function getProductsWithFeature(featureId: string): Product[] {
  const productIds = recipeAssociations.featureToProducts[featureId];
  if (!productIds) return [];

  return getProductsByIds(productIds);
}

export function getRecommendedProductsForRecipe(recipe: Recipe): Product[] {
  // First try to detect category from recipe name/description
  const categoryId = detectRecipeCategory(recipe.name) ||
                     detectRecipeCategory(recipe.description || '');

  if (categoryId) {
    return getProductsForRecipeCategory(categoryId);
  }

  // Fallback to recipe's explicit recommended products
  if (recipe.recommendedProducts) {
    return getProductsByIds(recipe.recommendedProducts);
  }

  // Default to versatile products
  return getProductsByIds(['ascent-x5', 'ascent-x4', 'ascent-x3']);
}

export function getRecipesForRecipeCategory(categoryId: string): Recipe[] {
  const category = recipeAssociations.categories[categoryId];
  if (!category) return [];

  const lowerKeywords = category.keywords.map(k => k.toLowerCase());

  return recipes.filter(recipe => {
    const lowerName = recipe.name.toLowerCase();
    const lowerDesc = (recipe.description || '').toLowerCase();

    return lowerKeywords.some(keyword =>
      lowerName.includes(keyword) || lowerDesc.includes(keyword)
    );
  });
}

// ============================================
// FAQ Queries
// ============================================

export function getAllFAQs(): FAQ[] {
  return faqs;
}

export function getFAQsByCategory(category: string): FAQ[] {
  return faqs.filter(faq => faq.category === category);
}

export function getFAQsForQuery(query: string): FAQ[] {
  const lowerQuery = query.toLowerCase();

  // Score each FAQ based on keyword matches
  const scored = faqs.map(faq => {
    let score = 0;

    // Check if query contains any FAQ keywords
    for (const keyword of faq.keywords) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        score += 2;
      }
    }

    // Check if question or answer contains query words
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 3);
    for (const word of queryWords) {
      if (faq.question.toLowerCase().includes(word)) score += 1;
      if (faq.answer.toLowerCase().includes(word)) score += 0.5;
    }

    return { faq, score };
  });

  // Return FAQs with score > 0, sorted by score
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.faq);
}

// ============================================
// Build RAG Context
// ============================================

export interface RAGContext {
  relevantProducts: Product[];
  relevantRecipes: Recipe[];
  relevantUseCases: UseCase[];
  detectedPersona: UserPersona | null;
  contentSummary: ContentSummary;
}

// Common ingredient keywords for detection in user queries
const COMMON_INGREDIENTS: string[] = [
  // Fruits
  'strawberry', 'strawberries', 'banana', 'bananas', 'blueberry', 'blueberries',
  'apple', 'apples', 'mango', 'mangoes', 'pineapple', 'orange', 'oranges',
  'peach', 'peaches', 'raspberry', 'raspberries', 'blackberry', 'blackberries',
  'kale', 'spinach', 'avocado', 'acai', 'berry', 'berries', 'grape', 'grapes',
  'cherry', 'cherries', 'watermelon', 'papaya', 'lemon', 'lime', 'cranberry',
  // Vegetables
  'carrot', 'carrots', 'celery', 'beet', 'beets', 'cucumber', 'tomato', 'tomatoes',
  'broccoli', 'cauliflower', 'ginger', 'garlic', 'onion', 'pepper', 'sweet potato',
  'squash', 'zucchini', 'pumpkin',
  // Nuts & Seeds
  'almond', 'almonds', 'cashew', 'cashews', 'peanut', 'peanuts', 'walnut', 'walnuts',
  'hazelnut', 'hazelnuts', 'chia', 'flax', 'hemp', 'sunflower',
  // Other
  'coconut', 'oat', 'oats', 'chocolate', 'cocoa', 'cacao', 'vanilla', 'honey',
  'yogurt', 'milk', 'protein', 'basil', 'mint', 'cilantro', 'turmeric', 'matcha',
  'coffee', 'espresso', 'cinnamon',
];

/**
 * Extract ingredient terms from a user query.
 * Returns matching ingredient keywords found in the query.
 */
export function extractIngredients(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  return COMMON_INGREDIENTS.filter(ingredient => {
    // Use word boundary matching to avoid partial matches
    const regex = new RegExp(`\\b${ingredient}\\b`, 'i');
    return regex.test(lowerQuery);
  });
}

// Keywords to match against use cases and product features
const USE_CASE_KEYWORDS: Record<string, string[]> = {
  smoothies: ['smoothie', 'smoothies', 'shake', 'shakes', 'fruit', 'frozen', 'kids smoothie', 'morning shake'],
  soups: ['soup', 'soups', 'hot soup', 'hot soups', 'puree', 'pureed', 'picky eater', 'picky eaters', 'hide vegetables', 'hiding vegetables', 'sneak vegetables', 'doesn\'t like veggies', 'won\'t eat vegetables', 'green soup'],
  'nut-butters': ['nut butter', 'nut butters', 'peanut butter', 'almond butter', 'nuts'],
  'frozen-desserts': ['ice cream', 'frozen dessert', 'sorbet', 'frozen treat', 'nice cream'],
  grinding: ['grind', 'grinding', 'flour', 'grain', 'coffee'],
  dips: ['dip', 'dips', 'hummus', 'salsa', 'guacamole'],
  baby: ['baby food', 'baby', 'infant', 'toddler'],
  cocktails: ['cocktail', 'cocktails', 'margarita', 'frozen drink'],
  family: ['family', 'kids', 'children', 'son', 'daughter', 'family of'],
};

function extractKeywords(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const keywords: string[] = [];

  for (const [useCase, terms] of Object.entries(USE_CASE_KEYWORDS)) {
    for (const term of terms) {
      if (lowerQuery.includes(term)) {
        keywords.push(useCase);
        break;
      }
    }
  }

  return keywords;
}

/**
 * Extract product model names from query (e.g., "X5", "A2300", "750")
 */
function extractProductModels(query: string): string[] {
  const models: string[] = [];
  const lowerQuery = query.toLowerCase();

  // Common Vitamix model patterns
  const modelPatterns = [
    /\bx5\b/gi,
    /\bx4\b/gi,
    /\bx3\b/gi,
    /\ba3500\b/gi,
    /\ba2500\b/gi,
    /\ba2300\b/gi,
    /\ba3300\b/gi,
    /\be310\b/gi,
    /\be320\b/gi,
    /\b750\b/gi,
    /\b7500\b/gi,
    /\bpropel\b/gi,
    /\bascent\b/gi,
    /\bventurist\b/gi,
    /\bexplorian\b/gi,
    /\blegacy\b/gi,
    /\bfamily\s*pack\b/gi,
  ];

  for (const pattern of modelPatterns) {
    const matches = query.match(pattern);
    if (matches) {
      models.push(...matches.map(m => m.toLowerCase()));
    }
  }

  return [...new Set(models)];
}

export function buildRAGContext(
  query: string,
  intent?: string,
  maxProducts = 5,
  maxRecipes = 6
): RAGContext {
  const lowerQuery = query.toLowerCase();

  // Detect user persona
  const detectedPersona = detectPersona(query);

  // Extract use case keywords from query
  const detectedKeywords = extractKeywords(query);

  // Extract ingredient terms from query (NEW)
  const detectedIngredients = extractIngredients(query);

  // Extract product model names from query
  const productModels = extractProductModels(query);

  // Find relevant products - first try exact model matches
  let relevantProducts: Product[] = [];

  // Search by extracted model names first (highest priority)
  if (productModels.length > 0) {
    for (const model of productModels) {
      const modelProducts = products.filter(p =>
        p.name.toLowerCase().includes(model) ||
        p.id?.toLowerCase().includes(model)
      );
      relevantProducts = [...relevantProducts, ...modelProducts];
    }
  }

  // Then try general search if no model matches
  if (relevantProducts.length === 0) {
    relevantProducts = searchProducts(query);
  }

  // If still no products, try keyword-based search
  if (relevantProducts.length === 0 && detectedKeywords.length > 0) {
    for (const keyword of detectedKeywords) {
      const keywordProducts = products.filter(p =>
        p.bestFor?.some(bf => bf.toLowerCase().includes(keyword)) ||
        p.features?.some(f => f.toLowerCase().includes(keyword)) ||
        p.description?.toLowerCase().includes(keyword)
      );
      relevantProducts = [...relevantProducts, ...keywordProducts];
    }
  }

  // If persona detected, add their recommended products
  if (detectedPersona && relevantProducts.length < maxProducts) {
    const personaProducts = getProductsByIds(detectedPersona.recommendedProducts);
    relevantProducts = [
      ...relevantProducts,
      ...personaProducts.filter((p) => !relevantProducts.some((rp) => rp.id === p.id)),
    ];
  }

  // Fallback: provide top products if nothing matched
  if (relevantProducts.length === 0) {
    relevantProducts = products.slice(0, maxProducts);
  }

  // Dedupe and limit products
  relevantProducts = [...new Map(relevantProducts.map(p => [p.id, p])).values()].slice(0, maxProducts);

  // Feature-aware ranking: prioritize products with required features for detected use case
  const featureRequirements: Record<string, string[]> = {
    soups: ['hot-soup-program'],
    soup: ['hot-soup-program'],
    'hot-soup': ['hot-soup-program'],
    'frozen-desserts': ['preset-programs'],
    'ice-cream': ['preset-programs'],
    'nut-butters': ['tamper'],
    'nut-butter': ['tamper'],
  };

  // Products known to have Hot Soup Program
  const hotSoupProducts = ['ascent-x5', 'ascent-x4', 'ascent-x3', 'a3500', 'a2500', 'propel-750'];

  // Check if any detected keyword matches a feature requirement
  const primaryUseCase = detectedKeywords.find((kw) => featureRequirements[kw]);
  if (primaryUseCase) {
    const requiredFeatures = featureRequirements[primaryUseCase];

    // Sort products to prioritize those with required features
    relevantProducts.sort((a, b) => {
      let aScore = 0;
      let bScore = 0;

      // Check for hot soup program specifically
      if (requiredFeatures.includes('hot-soup-program')) {
        if (hotSoupProducts.some((id) => a.id?.includes(id) || a.name.toLowerCase().includes(id.replace('-', ' ')))) {
          aScore += 10;
        }
        if (hotSoupProducts.some((id) => b.id?.includes(id) || b.name.toLowerCase().includes(id.replace('-', ' ')))) {
          bScore += 10;
        }
      }

      // Check features array
      for (const feature of requiredFeatures) {
        if (a.features?.some((f) => f.toLowerCase().includes(feature.replace('-', ' ')))) {
          aScore += 5;
        }
        if (b.features?.some((f) => f.toLowerCase().includes(feature.replace('-', ' ')))) {
          bScore += 5;
        }
      }

      return bScore - aScore; // Higher score first
    });
  }

  // Find relevant use cases
  let relevantUseCases = useCases.filter(
    (uc) =>
      lowerQuery.includes(uc.id) ||
      lowerQuery.includes(uc.name.toLowerCase()) ||
      uc.relevantFeatures.some((f) => lowerQuery.includes(f.toLowerCase())) ||
      detectedKeywords.includes(uc.id)
  );

  // Fallback: provide default use cases if nothing matched
  if (relevantUseCases.length === 0) {
    relevantUseCases = useCases.slice(0, 3);
  }

  // Find relevant recipes
  let relevantRecipes: Recipe[] = [];

  // PRIORITY 1: If ingredients detected, use ingredient-based search (NEW)
  if (detectedIngredients.length > 0) {
    const ingredientQuery = detectedIngredients.join(' ');
    const ingredientRecipes = searchRecipes(ingredientQuery, maxRecipes * 2);
    relevantRecipes = [...ingredientRecipes];
  }

  // PRIORITY 2: Also search using the full query (searches name, description, AND ingredients)
  if (relevantRecipes.length < maxRecipes) {
    const queryRecipes = searchRecipes(query, maxRecipes);
    // Add unique recipes not already found
    for (const r of queryRecipes) {
      if (!relevantRecipes.some(existing => existing.name === r.name)) {
        relevantRecipes.push(r);
      }
    }
  }

  // PRIORITY 3: Try category-based recipe search
  if (relevantRecipes.length < maxRecipes) {
    for (const keyword of detectedKeywords) {
      const categoryRecipes = recipes.filter(r =>
        r.category?.toLowerCase().includes(keyword) ||
        r.name.toLowerCase().includes(keyword) ||
        r.description?.toLowerCase().includes(keyword)
      );
      for (const r of categoryRecipes) {
        if (!relevantRecipes.some(existing => existing.name === r.name)) {
          relevantRecipes.push(r);
        }
      }
    }
  }

  // PRIORITY 4: If no recipes from keywords, try use cases
  if (relevantRecipes.length === 0 && relevantUseCases.length > 0) {
    for (const uc of relevantUseCases) {
      const categoryRecipes = getRecipesByCategory(uc.id);
      relevantRecipes = [...relevantRecipes, ...categoryRecipes];
    }
  }

  // PRIORITY 5: Last resort - search by query words in name/category
  if (relevantRecipes.length === 0) {
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 3);
    relevantRecipes = recipes.filter(r =>
      queryWords.some(word =>
        r.name.toLowerCase().includes(word) ||
        r.category?.toLowerCase().includes(word)
      )
    );
  }

  // Final fallback: provide some recipes
  if (relevantRecipes.length === 0) {
    relevantRecipes = recipes.slice(0, maxRecipes);
  }

  // Dedupe by name (not id, since many recipes have empty id) and limit
  // Also prefer recipes with real images over placeholders
  relevantRecipes = [...new Map(relevantRecipes.map(r => [r.name, r])).values()];

  // Diversity filter: limit recipes per category/subcategory to avoid repetition
  // (e.g., 5 green smoothie variations should be reduced to max 2)
  const recipesByCategory = new Map<string, Recipe[]>();
  for (const recipe of relevantRecipes) {
    // Use subcategory if available, otherwise category, otherwise 'other'
    const categoryKey = recipe.subcategory || recipe.category || 'other';
    const existing = recipesByCategory.get(categoryKey) || [];
    existing.push(recipe);
    recipesByCategory.set(categoryKey, existing);
  }

  // Round-robin selection: take recipes from each category alternately
  // Max 2 per category to ensure diversity
  const diverseRecipes: Recipe[] = [];
  const categories = [...recipesByCategory.keys()];
  const maxPerCategory = 2;

  // Keep taking one from each category until we have enough or run out
  let categoryIndex = 0;
  let itemsPerCategoryTaken = new Map<string, number>();

  while (diverseRecipes.length < maxRecipes && categories.length > 0) {
    const category = categories[categoryIndex % categories.length];
    const categoryRecipes = recipesByCategory.get(category) || [];
    const taken = itemsPerCategoryTaken.get(category) || 0;

    if (taken < maxPerCategory && taken < categoryRecipes.length) {
      diverseRecipes.push(categoryRecipes[taken]);
      itemsPerCategoryTaken.set(category, taken + 1);
    }

    categoryIndex++;

    // Remove categories that are exhausted
    if (taken + 1 >= maxPerCategory || taken + 1 >= categoryRecipes.length) {
      const catIdx = categories.indexOf(category);
      if (catIdx > -1) {
        categories.splice(catIdx, 1);
      }
      categoryIndex = 0; // Reset to start of remaining categories
    }
  }

  // Use diverse recipes if we got any, otherwise fall back to original
  if (diverseRecipes.length > 0) {
    relevantRecipes = diverseRecipes;
  }

  // Sort to prioritize recipes with real images
  relevantRecipes.sort((a, b) => {
    const aHasImage = a.images?.primary &&
      !a.images.primary.includes('vitamix-logo') &&
      !a.images.primary.includes('noimageimage') ? 1 : 0;
    const bHasImage = b.images?.primary &&
      !b.images.primary.includes('vitamix-logo') &&
      !b.images.primary.includes('noimageimage') ? 1 : 0;
    return bHasImage - aHasImage; // Real images first
  });

  relevantRecipes = relevantRecipes.slice(0, maxRecipes);

  return {
    relevantProducts,
    relevantRecipes,
    relevantUseCases,
    detectedPersona,
    contentSummary: getContentSummary(),
  };
}

export default {
  // Products
  getAllProducts,
  getProductById,
  getProductsByIds,
  getProductsBySeries,
  getProductsByPriceRange,
  getProductsByUseCase,
  searchProducts,

  // Recipes
  getAllRecipes,
  getRecipeById,
  getRecipesByCategory,
  getRecipesByDifficulty,
  getRecipesForProduct,
  getRecipeCategories,
  searchRecipes,
  extractIngredients,

  // Use Cases & Features
  getAllUseCases,
  getUseCaseById,
  getAllFeatures,
  getFeatureById,
  getFeaturesForProduct,

  // Accessories
  getAllAccessories,
  getAccessoryById,
  getAccessoriesByType,
  getAccessoriesForSeries,
  getContainersForProduct,
  searchAccessories,

  // Reviews
  getAllReviews,
  getReviewsByProduct,
  getReviewsByUseCase,
  getAverageRating,

  // Personas
  getAllPersonas,
  getPersonaById,
  detectPersona,

  // Product Profiles
  getProductProfile,
  getProductsForUseCase,
  getProductsByPriceTier,
  getProductsByHouseholdFit,

  // Recipe-Product Associations
  getRecipeCategory,
  detectRecipeCategory,
  getProductsForRecipeCategory,
  getProductsWithFeature,
  getRecommendedProductsForRecipe,
  getRecipesForRecipeCategory,

  // FAQs
  getAllFAQs,
  getFAQsByCategory,
  getFAQsForQuery,

  // Utilities
  getContentSummary,
  buildRAGContext,
};
