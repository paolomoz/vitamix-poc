/**
 * Recipe Lookup Utility
 *
 * Provides functions to look up real Vitamix recipes by title.
 * Uses the recipe URLs from the Vitamix sitemap as the source of truth.
 */

// Cache for loaded recipe data
let recipeIndex = null;
let loadPromise = null;

/**
 * Load the recipe index from the crawler data
 * Returns a Map of slug -> full URL
 */
async function loadRecipeIndex() {
  if (recipeIndex) return recipeIndex;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Load recipe URLs from the crawler data
      const response = await fetch('/tools/crawler/recipe-urls.json');
      if (!response.ok) {
        console.warn('[recipe-lookup] Failed to load recipe index, falling back to empty');
        recipeIndex = new Map();
        return recipeIndex;
      }

      const data = await response.json();
      const recipes = data.recipes || [];

      // Build index: slug -> { url, title }
      recipeIndex = new Map();

      for (const url of recipes) {
        // Extract slug from URL like:
        // https://www.vitamix.com/us/en_us/recipes/creamy-oatmeal/
        const match = url.match(/\/recipes\/([^/]+)\/?$/);
        if (match) {
          const slug = match[1];
          // Convert slug to title: "creamy-oatmeal" -> "Creamy Oatmeal"
          const title = slugToTitle(slug);
          recipeIndex.set(slug, { url, title, slug });
        }
      }

      console.log(`[recipe-lookup] Loaded ${recipeIndex.size} recipes`);
      return recipeIndex;
    } catch (error) {
      console.error('[recipe-lookup] Error loading recipe index:', error);
      recipeIndex = new Map();
      return recipeIndex;
    }
  })();

  return loadPromise;
}

/**
 * Convert a URL slug to a display title
 * "creamy-oatmeal" -> "Creamy Oatmeal"
 */
function slugToTitle(slug) {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Convert a title to a URL slug
 * "Creamy Oatmeal Recipe" -> "creamy-oatmeal"
 */
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/\s+recipe$/i, '') // Remove "Recipe" suffix
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove duplicate hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .trim();
}

/**
 * Calculate similarity between two strings (Levenshtein-based)
 * Returns a score from 0 to 1, where 1 is an exact match
 */
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i += 1) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j += 1) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Look up a recipe by title
 * Returns the best match with { url, title, slug, score } or null if no good match
 *
 * @param {string} searchTitle - The recipe title to search for
 * @param {number} minScore - Minimum similarity score (0-1) to accept a match
 * @returns {Promise<{url: string, title: string, slug: string, score: number} | null>}
 */
export async function lookupRecipe(searchTitle, minScore = 0.7) {
  const index = await loadRecipeIndex();

  if (index.size === 0) {
    return null;
  }

  const searchSlug = titleToSlug(searchTitle);
  const searchTitleLower = searchTitle.toLowerCase();

  // First, try exact slug match
  if (index.has(searchSlug)) {
    const recipe = index.get(searchSlug);
    return { ...recipe, score: 1.0 };
  }

  // Second, try fuzzy matching
  let bestMatch = null;
  let bestScore = 0;

  for (const [slug, recipe] of index) {
    // Compare slugs
    const slugScore = similarity(searchSlug, slug);

    // Compare titles
    const titleScore = similarity(searchTitleLower, recipe.title.toLowerCase());

    // Use the better of the two scores
    const score = Math.max(slugScore, titleScore);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = recipe;
    }
  }

  if (bestMatch && bestScore >= minScore) {
    return { ...bestMatch, score: bestScore };
  }

  return null;
}

/**
 * Check if a recipe exists (exact match only)
 *
 * @param {string} searchTitle - The recipe title to check
 * @returns {Promise<boolean>}
 */
export async function recipeExists(searchTitle) {
  const index = await loadRecipeIndex();
  const searchSlug = titleToSlug(searchTitle);
  return index.has(searchSlug);
}

/**
 * Get the validated URL for a recipe, or a fallback search URL
 *
 * @param {string} searchTitle - The recipe title
 * @param {number} minScore - Minimum match score to accept
 * @returns {Promise<{url: string, isValidated: boolean, matchedTitle?: string}>}
 */
export async function getRecipeUrl(searchTitle, minScore = 0.7) {
  const match = await lookupRecipe(searchTitle, minScore);

  if (match) {
    return {
      url: match.url,
      isValidated: true,
      matchedTitle: match.title,
      score: match.score,
    };
  }

  // Fallback: return a search URL
  const searchQuery = encodeURIComponent(searchTitle);
  return {
    url: `https://www.vitamix.com/us/en_us/recipes?q=${searchQuery}`,
    isValidated: false,
  };
}

/**
 * Preload the recipe index (call early for better performance)
 */
export function preloadRecipeIndex() {
  loadRecipeIndex();
}

export default {
  lookupRecipe,
  recipeExists,
  getRecipeUrl,
  preloadRecipeIndex,
};
