/**
 * Use Case Cards Block
 * Displays use cases in a grid layout with clickable cards that generate contextual pages
 */

/**
 * Get page context for generating contextual queries
 * @returns {string} - Context string (e.g., product name, page title)
 */
function getPageContext() {
  // Try to get product name from product-hero or product-info blocks
  const productHero = document.querySelector('.product-hero .product-hero-title, .product-hero h1');
  if (productHero) {
    return productHero.textContent.trim();
  }

  // Try to get from product-info
  const productInfo = document.querySelector('.product-info-title, .product-info h1');
  if (productInfo) {
    return productInfo.textContent.trim();
  }

  // Try to get from recommendation headline
  const recommendation = document.querySelector('.product-recommendation-headline');
  if (recommendation) {
    return recommendation.textContent.trim();
  }

  // Try to get from main hero
  const hero = document.querySelector('.hero h1, .hero-title');
  if (hero) {
    const text = hero.textContent.trim();
    // Avoid generic hero titles
    if (!text.toLowerCase().includes('welcome') && !text.toLowerCase().includes('discover')) {
      return text;
    }
  }

  // Fall back to page title
  const pageTitle = document.title.split('|')[0].trim();
  if (pageTitle && pageTitle !== 'Vitamix') {
    return pageTitle;
  }

  return '';
}

/**
 * Build a contextual query for the use case
 * @param {string} useCaseTitle - The use case title
 * @param {string} context - Page context
 * @returns {string} - Generated query
 */
function buildUseCaseQuery(useCaseTitle, context) {
  const title = useCaseTitle.toLowerCase();

  if (context) {
    return `Tell me about making ${title} with the ${context}`;
  }

  return `Tell me about making ${title} with a Vitamix blender`;
}

/**
 * Handle card click - navigate to generated page
 * @param {Event} event - Click event
 * @param {string} useCaseTitle - The use case title
 */
function handleCardClick(event, useCaseTitle) {
  event.preventDefault();

  const context = getPageContext();
  const query = buildUseCaseQuery(useCaseTitle, context);

  // Determine preset based on AI mode from sessionStorage
  // - quality: preset=production (Claude for reasoning, Cerebras for content)
  // - speed: preset=all-cerebras (Cerebras for everything, faster)
  const aiMode = sessionStorage.getItem('ai-mode') || 'speed';
  const preset = aiMode === 'speed' ? 'all-cerebras' : 'production';

  // Navigate with q parameter and preset
  window.location.href = `/?q=${encodeURIComponent(query)}&preset=${preset}`;
}

/**
 * Set up click handler on a card
 * @param {HTMLElement} card - The card element
 */
function setupCardClickHandler(card) {
  // Get the title from the card
  const titleEl = card.querySelector('.use-case-title, h3, h4, strong');
  if (!titleEl) return;

  const title = titleEl.textContent.trim();
  if (!title) return;

  // Make the card focusable and accessible
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Learn more about ${title}`);

  // Add click handler
  card.addEventListener('click', (e) => handleCardClick(e, title));

  // Add keyboard handler for accessibility
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(e, title);
    }
  });
}

export default function decorate(block) {
  // Handle header element if present
  const header = block.querySelector('.ucheader');
  if (header) {
    header.classList.add('use-case-cards-header');
  }

  // The AI generates various structures, normalize to cards
  const rows = [...block.children].filter((el) => !el.classList.contains('ucheader'));

  // If already has proper structure, enhance it
  const existingCards = block.querySelectorAll('.use-case-card');
  if (existingCards.length > 0) {
    block.classList.add('use-case-cards-grid');
    block.dataset.cardCount = existingCards.length;
    // Set up click handlers on existing cards
    existingCards.forEach((card) => setupCardClickHandler(card));
    return;
  }

  // Build cards from rows
  const cards = [];

  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length === 0) return;

    const card = document.createElement('div');
    card.className = 'use-case-card';

    // Check if first cell has an icon/image
    const firstCell = cells[0];
    const img = firstCell?.querySelector('img');
    const icon = firstCell?.querySelector('.icon');

    if (img || icon) {
      const iconDiv = document.createElement('div');
      iconDiv.className = 'use-case-icon';
      iconDiv.appendChild(img || icon);
      card.appendChild(iconDiv);
      cells.shift();
    }

    // Rest of cells become content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'use-case-content';

    cells.forEach((cell, i) => {
      const text = cell.textContent?.trim();
      if (!text) return;

      if (i === 0 || cell.querySelector('h3, h4, strong, b')) {
        const title = document.createElement('h4');
        title.className = 'use-case-title';
        title.textContent = cell.querySelector('h3, h4, strong, b')?.textContent || text;
        contentDiv.appendChild(title);
      } else {
        const desc = document.createElement('p');
        desc.className = 'use-case-description';
        desc.innerHTML = cell.innerHTML;
        contentDiv.appendChild(desc);
      }
    });

    if (contentDiv.children.length > 0) {
      card.appendChild(contentDiv);
      cards.push(card);
    }
  });

  // Clear and rebuild, preserving header
  if (cards.length > 0) {
    block.innerHTML = '';
    if (header) {
      block.appendChild(header);
    }
    block.classList.add('use-case-cards-grid');
    block.dataset.cardCount = cards.length;
    cards.forEach((card) => {
      setupCardClickHandler(card);
      block.appendChild(card);
    });
  }
}
