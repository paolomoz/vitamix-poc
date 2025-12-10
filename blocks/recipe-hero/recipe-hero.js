/**
 * Recipe Hero Block
 *
 * Displays a recipe hero with image, title, description, and CTA.
 * Handles both authored table structure and AI-generated flat structure.
 */

/**
 * Generate a Vitamix recipe URL from the recipe title
 * @param {string} title - Recipe title like "Acai Bowl Recipe"
 * @returns {string} - Full Vitamix URL
 */
function generateVitamixUrl(title) {
  // Clean up the title: remove "Recipe" suffix, convert to URL slug
  const slug = title
    .toLowerCase()
    .replace(/\s+recipe$/i, '') // Remove "Recipe" suffix
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove duplicate hyphens
    .trim();

  return `https://www.vitamix.com/us/en_us/recipes/${slug}`;
}

/**
 * Check if an image has a valid src (not a placeholder)
 */
function hasValidImageSrc(img) {
  if (!img) return false;
  const src = img.getAttribute('src') || '';
  if (!src || src === '' || src === '#') return false;
  // Reject common placeholder patterns
  if (src.startsWith('data:')) return false;
  if (src.includes('example.com')) return false;
  if (src.includes('placeholder')) return false;
  return true;
}

export default function decorate(block) {
  // Extract all content from the block
  const picture = block.querySelector('picture');
  const img = block.querySelector('img');
  const h1 = block.querySelector('h1');
  const h2 = block.querySelector('h2');
  const h3 = block.querySelector('h3');
  const paragraphs = block.querySelectorAll('p');
  const existingLink = block.querySelector('a');

  // Check if image is valid
  const hasImage = picture || hasValidImageSrc(img);

  // Determine headline vs recipe title
  // If h3 exists, h2 is section headline and h3 is recipe title
  // If only h2 exists and contains "Recipe", it's the recipe title
  const h2Text = h2?.textContent.trim() || '';
  const h3Text = h3?.textContent.trim() || '';
  const h1Text = h1?.textContent.trim() || '';

  let sectionHeadline = '';
  let recipeTitle = '';

  if (h3Text) {
    // h3 is the recipe title, h2 is section headline
    sectionHeadline = h2Text;
    recipeTitle = h3Text;
  } else if (h2Text && (h2Text.toLowerCase().includes('recipe') || h2Text.length < 40)) {
    // h2 looks like a recipe title (contains "Recipe" or is short)
    recipeTitle = h2Text;
  } else if (h2Text) {
    // h2 is a longer section headline
    sectionHeadline = h2Text;
  }

  // Fallback to h1 if no recipe title found
  if (!recipeTitle && h1Text) {
    recipeTitle = h1Text;
  }

  // Parse paragraphs into description and recipe text
  let sectionDescription = '';
  let recipeDescription = '';

  paragraphs.forEach((p) => {
    const text = p.textContent.trim();
    if (!text) return;

    // Skip if it's inside a link wrapper
    if (p.querySelector('a')) return;

    if (sectionHeadline) {
      // If we have a section headline, first para is section desc, second is recipe desc
      if (!sectionDescription && text.length > 30) {
        sectionDescription = text;
      } else if (sectionDescription && !recipeDescription && text.length > 20) {
        recipeDescription = text;
      }
    } else {
      // No section headline - first para is recipe description
      if (!recipeDescription && text.length > 20) {
        recipeDescription = text;
      }
    }
  });

  // Get CTA info from existing link or create default
  let ctaText = existingLink?.textContent.trim() || 'View Full Recipe';
  let ctaHref = existingLink?.href || '#';

  // If the link is just "#", generate the real Vitamix URL
  if (ctaHref === '#' || ctaHref.endsWith('#')) {
    ctaHref = generateVitamixUrl(recipeTitle || 'acai-bowl');
  }

  // Only rebuild if we found meaningful content
  if (!sectionHeadline && !recipeTitle && !hasImage) {
    console.warn('[recipe-hero] No content found, preserving original markup');
    return;
  }

  // Build new structure
  block.innerHTML = '';

  // Section header (if we have a section headline)
  if (sectionHeadline) {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'recipe-hero__header';

    const headline = document.createElement('h2');
    headline.className = 'recipe-hero__headline';
    headline.textContent = sectionHeadline;
    headerDiv.appendChild(headline);

    if (sectionDescription) {
      const desc = document.createElement('p');
      desc.className = 'recipe-hero__section-desc';
      desc.textContent = sectionDescription;
      headerDiv.appendChild(desc);
    }

    block.appendChild(headerDiv);
  }

  // Only show the card if we have either a valid image or a recipe title
  if (hasImage || recipeTitle) {
    // Recipe card container
    const cardDiv = document.createElement('div');
    cardDiv.className = 'recipe-hero__card';

    // Image side - only add if we have a valid image
    if (hasImage) {
      const imageDiv = document.createElement('div');
      imageDiv.className = 'recipe-hero__image';
      if (picture) {
        imageDiv.appendChild(picture.cloneNode(true));
      } else if (img) {
        imageDiv.appendChild(img.cloneNode(true));
      }
      cardDiv.appendChild(imageDiv);
    }

    // Content side
    const contentDiv = document.createElement('div');
    contentDiv.className = 'recipe-hero__content';

    // Add full-width class if no image
    if (!hasImage) {
      contentDiv.classList.add('recipe-hero__content--full');
    }

    if (recipeTitle) {
      const title = document.createElement('h3');
      title.className = 'recipe-hero__title';
      title.textContent = recipeTitle;
      contentDiv.appendChild(title);
    }

    if (recipeDescription) {
      const text = document.createElement('p');
      text.className = 'recipe-hero__text';
      text.textContent = recipeDescription;
      contentDiv.appendChild(text);
    }

    // CTA Button - only show if we have a recipe title for a valid link
    if (recipeTitle) {
      const cta = document.createElement('a');
      cta.className = 'recipe-hero__cta';
      cta.href = ctaHref;
      cta.textContent = ctaText;
      cta.target = '_blank';
      cta.rel = 'noopener noreferrer';
      contentDiv.appendChild(cta);
    }

    cardDiv.appendChild(contentDiv);
    block.appendChild(cardDiv);
  }
}
