/**
 * CTA Utilities
 * Provides classification and decoration for different CTA types:
 * - External links (vitamix.com) - show external link icon
 * - AI-generated links (?q= parameter) - show AI sparkle icon
 */

/**
 * Purchase-related terms to replace (ONLY when used alone, not in value-driven context)
 */
const PURCHASE_REPLACEMENTS = {
  'add to cart': 'View Details',
  'buy now': 'Learn More',
  'shop now': 'View on Vitamix',
  purchase: 'Explore',
  checkout: 'Continue',
  buy: 'View',
};

/**
 * Patterns that indicate a value-driven CTA (should be preserved)
 * These CTAs are personalized and provide context about the product/use case
 */
const VALUE_DRIVEN_PATTERNS = [
  /perfect for/i,
  /great for/i,
  /ideal for/i,
  /best for/i,
  /get the .+ for/i, // "Get the X5 for Your Family"
  /explore the/i,
  /see why/i,
  /start your/i,
  /start making/i,
  /right for you/i,
  /we recommend/i,
  /your family/i,
  /your smoothies/i,
  /your soups/i,
  /silky smoothies/i,
  /restaurant-quality/i,
  /wellness journey/i,
  /best value/i,
];

/**
 * Classify a link based on its href
 * @param {string} href - The link URL
 * @returns {'external' | 'ai-generated' | 'internal'}
 */
export function classifyLink(href) {
  if (!href) return 'internal';

  try {
    const url = new URL(href, window.location.origin);

    // Check for AI-generated page links (has ?q= parameter)
    if (url.searchParams.has('q')) {
      return 'ai-generated';
    }

    // Check for external vitamix.com links or other external domains
    if (href.includes('vitamix.com') || url.host !== window.location.host) {
      return 'external';
    }

    return 'internal';
  } catch {
    // If URL parsing fails, check simple patterns
    if (href.includes('?q=')) return 'ai-generated';
    if (href.includes('vitamix.com') || href.startsWith('http')) return 'external';
    return 'internal';
  }
}

/**
 * Check if CTA text is value-driven (personalized with context)
 * Value-driven CTAs should be preserved, not sanitized
 * @param {string} text - CTA text to check
 * @returns {boolean} - True if value-driven
 */
export function isValueDrivenCTA(text) {
  if (!text) return false;
  return VALUE_DRIVEN_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitize CTA text to remove purchase-intent language
 * Preserves value-driven CTAs that contain product/use-case context
 * @param {string} text - Original CTA text
 * @returns {string} - Sanitized text
 */
export function sanitizeCTAText(text) {
  if (!text) return text;

  // Preserve value-driven CTAs (personalized with context)
  if (isValueDrivenCTA(text)) {
    return text;
  }

  let sanitized = text;
  const lowerText = text.toLowerCase();

  // Check each purchase term and replace
  Object.entries(PURCHASE_REPLACEMENTS).forEach(([term, replacement]) => {
    if (lowerText.includes(term)) {
      // Create case-insensitive regex
      const regex = new RegExp(term, 'gi');
      sanitized = sanitized.replace(regex, replacement);
    }
  });

  return sanitized;
}

/**
 * Check if text contains purchase-intent language
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export function hasPurchaseIntent(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return Object.keys(PURCHASE_REPLACEMENTS).some((term) => lowerText.includes(term));
}

/**
 * Create an icon element for CTA type
 * @param {'external' | 'ai-generated'} type - The CTA type
 * @returns {HTMLSpanElement}
 */
export function createCTAIcon(type) {
  const icon = document.createElement('span');
  icon.className = `cta-icon cta-icon-${type}`;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

/**
 * Decorate a link with appropriate icon based on type
 * @param {HTMLAnchorElement} link - The link element
 * @param {'external' | 'ai-generated'} type - The CTA type
 */
export function decorateLinkWithIcon(link, type) {
  // Don't add icon if already decorated
  if (link.querySelector('.cta-icon')) return;

  // Add type class to link
  link.classList.add(`cta-${type}`);

  const icon = createCTAIcon(type);

  if (type === 'external') {
    // External icon goes at the end
    link.appendChild(icon);
    // Ensure opens in new tab
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  } else if (type === 'ai-generated') {
    // AI icon goes at the beginning
    link.insertBefore(icon, link.firstChild);
  }
}

/**
 * Fully decorate a CTA link: classify, sanitize text, add icon, track conversions
 * @param {HTMLAnchorElement} link - The link element
 * @returns {'external' | 'ai-generated' | 'internal'} - The classified type
 */
export function decorateCTA(link) {
  const type = classifyLink(link.href);

  // Sanitize purchase-intent text
  const textNodes = [];
  link.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node);
    }
  });

  textNodes.forEach((node) => {
    const sanitized = sanitizeCTAText(node.textContent);
    if (sanitized !== node.textContent) {
      node.textContent = sanitized;
    }
  });

  // Add icon for external and AI-generated links
  if (type === 'external' || type === 'ai-generated') {
    decorateLinkWithIcon(link, type);
  }

  // Track conversions for vitamix.com links
  if (type === 'external' && link.href.includes('vitamix.com')) {
    link.addEventListener('click', () => {
      // Try window.analyticsTracker first (set by delayed.js)
      // Then try importing the tracker directly
      if (window.analyticsTracker) {
        window.analyticsTracker.trackConversion(link.href, link.textContent?.trim());
      } else {
        // Dynamic import as fallback
        import('./analytics-tracker.js').then(({ getAnalyticsTracker }) => {
          const tracker = getAnalyticsTracker({
            endpoint: 'https://vitamix-analytics.paolo-moz.workers.dev',
          });
          if (!tracker.initialized) tracker.init();
          tracker.trackConversion(link.href, link.textContent?.trim());
        }).catch(() => {
          // Silently fail if analytics module not available
        });
      }
    });
  }

  return type;
}

export default {
  classifyLink,
  sanitizeCTAText,
  isValueDrivenCTA,
  hasPurchaseIntent,
  createCTAIcon,
  decorateLinkWithIcon,
  decorateCTA,
};
