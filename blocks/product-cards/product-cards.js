/**
 * Product Cards Block
 *
 * Displays product listings with pricing, ratings, and actions.
 * Aligned with vitamix.com product grid design.
 *
 * == DA/EDS Table Structure ==
 *
 * | Product Cards             |
 * |---------------------------|
 * | [product-image.jpg]       |
 * | **Vitamix A3500**         |
 * | ★★★★★ (1,234)             |
 * | $649.95                   |
 * | [[View Details]]          |
 *
 * For sale items, use the "sale" variant:
 * | Product Cards (sale)      |
 * |---------------------------|
 * | [product-image.jpg]       |
 * | **Vitamix E310**          |
 * | ★★★★★ (2,341)             |
 * | Now $299.95               |
 * | Save $50 | Was $349.95    |
 * | [[View Details]]          |
 *
 * Each row represents one product card.
 */

import { decorateCTA } from '../../scripts/cta-utils.js';

/**
 * Generates star rating HTML from a rating value
 * @param {number} rating - Rating value (0-5)
 * @returns {string} HTML string of stars
 */
function generateStars(rating) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  let stars = '';
  for (let i = 0; i < fullStars; i += 1) stars += '★';
  if (hasHalf) stars += '★'; // Could use half-star icon
  for (let i = 0; i < emptyStars; i += 1) stars += '☆';

  return stars;
}

/**
 * Parses rating text like "★★★★★ (1,234)" or "4.8 (1234 reviews)"
 * @param {string} text - Rating text
 * @returns {Object} { stars: string, count: string, rating: number }
 */
function parseRating(text) {
  // Check for star characters
  const starMatch = text.match(/([★☆]+)/);
  const countMatch = text.match(/\(([\d,]+)\s*(?:reviews?)?\)/i);

  if (starMatch) {
    const fullStars = (starMatch[1].match(/★/g) || []).length;
    return {
      stars: starMatch[1],
      count: countMatch ? countMatch[1] : '',
      rating: fullStars,
    };
  }

  // Check for numeric rating like "4.8"
  const numericMatch = text.match(/([\d.]+)/);
  if (numericMatch) {
    const rating = parseFloat(numericMatch[1]);
    return {
      stars: generateStars(rating),
      count: countMatch ? countMatch[1] : '',
      rating,
    };
  }

  return { stars: '★★★★★', count: '', rating: 5 };
}

/**
 * Parses price text and detects sale pricing
 * @param {string} text - Price text like "$649.95" or "Now $299.95"
 * @returns {Object} { current: string, original: string, savings: string, isSale: boolean }
 */
function parsePrice(text) {
  const result = {
    current: '',
    original: '',
    savings: '',
    isSale: false,
  };

  // Check for "Now $X" pattern (sale)
  const nowMatch = text.match(/now\s*\$?([\d,.]+)/i);
  if (nowMatch) {
    result.current = `$${nowMatch[1]}`;
    result.isSale = true;
    return result;
  }

  // Check for "Save $X | Was $X" pattern
  const saveWasMatch = text.match(/save\s*\$?([\d,.]+)\s*\|\s*was\s*\$?([\d,.]+)/i);
  if (saveWasMatch) {
    result.savings = `$${saveWasMatch[1]}`;
    result.original = `$${saveWasMatch[2]}`;
    result.isSale = true;
    return result;
  }

  // Regular price
  const priceMatch = text.match(/\$?([\d,.]+)/);
  if (priceMatch) {
    result.current = `$${priceMatch[1]}`;
  }

  return result;
}

export default function decorate(block) {
  // Handle header element if present
  const header = block.querySelector('.pcheader, header');
  if (header) {
    header.classList.add('product-cards-header');
  }

  // Check if already structured (AI-generated content with product-card classes)
  const existingCards = block.querySelectorAll('.product-card');
  if (existingCards.length > 0) {
    // Already structured - wrap in ul if not already
    if (!block.querySelector('ul')) {
      const ul = document.createElement('ul');
      ul.dataset.cardCount = existingCards.length;
      existingCards.forEach((card) => {
        const li = document.createElement('li');
        li.className = card.className;
        li.innerHTML = card.innerHTML;
        ul.appendChild(li);
      });
      block.textContent = '';
      if (header) {
        block.appendChild(header);
      }
      block.appendChild(ul);
    } else {
      const ul = block.querySelector('ul');
      ul.dataset.cardCount = existingCards.length;
    }
    // Ensure links have proper styling and icons
    block.querySelectorAll('a.button, a.product-cta').forEach((link) => {
      if (!link.classList.contains('product-cta')) {
        link.classList.add('product-cta');
      }
      // Decorate CTA with appropriate icon and sanitize text
      decorateCTA(link);
    });
    return;
  }

  const ul = document.createElement('ul');
  const isSale = block.classList.contains('sale');

  // Check for two-column format (image | content per row)
  // This is used by AI-generated content where each row has [image] | [title, price, link]
  const rows = [...block.children].filter((row) => !row.classList.contains('product-cards-header'));
  const isTwoColumnFormat = rows.length > 0 && rows.some((row) => {
    const cells = [...row.children];
    // Two-column format: first cell has picture, second cell has h3/link
    return cells.length === 2
      && cells[0].querySelector('picture')
      && (cells[1].querySelector('h3') || cells[1].querySelector('a'));
  });

  if (isTwoColumnFormat) {
    rows.forEach((row) => {
      const cells = [...row.children];
      if (cells.length < 2) return;

      const li = document.createElement('li');
      li.className = 'product-card';
      if (isSale) li.classList.add('sale');

      // Image cell (first cell)
      const imageDiv = document.createElement('div');
      imageDiv.className = 'product-card-image';
      const pic = cells[0].querySelector('picture');
      if (pic) {
        imageDiv.appendChild(pic.cloneNode(true));
      }

      // Content cell (second cell)
      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'product-card-body';

      const contentCell = cells[1];

      // Extract product name from h3 or first link
      const h3 = contentCell.querySelector('h3');
      if (h3) {
        const nameEl = document.createElement('h3');
        nameEl.className = 'product-name';
        const nameLink = h3.querySelector('a');
        if (nameLink) {
          nameEl.appendChild(nameLink.cloneNode(true));
        } else {
          nameEl.textContent = h3.textContent;
        }
        bodyDiv.appendChild(nameEl);
      }

      // Extract tagline/description (p elements that aren't price or button)
      const paragraphs = contentCell.querySelectorAll('p');
      paragraphs.forEach((p) => {
        const text = p.textContent.trim();
        // Skip if it's a price or contains a button
        if (text.startsWith('$') || p.querySelector('a.button, a[class*="button"]')) return;
        if (text && !text.match(/^\$[\d,.]+$/)) {
          const tagline = document.createElement('p');
          tagline.className = 'product-tagline';
          tagline.textContent = text;
          bodyDiv.appendChild(tagline);
        }
      });

      // Extract price
      const priceText = [...contentCell.querySelectorAll('p')].find((p) => p.textContent.trim().startsWith('$'));
      if (priceText) {
        const priceDiv = document.createElement('div');
        priceDiv.className = 'product-price';
        priceDiv.innerHTML = `<span class="current-price">${priceText.textContent.trim()}</span>`;
        bodyDiv.appendChild(priceDiv);
      }

      // Extract CTA button
      const ctaLink = contentCell.querySelector('a.button, a[class*="button"], p:last-child a');
      if (ctaLink) {
        const btn = document.createElement('a');
        btn.className = 'product-cta button';
        btn.href = ctaLink.href;
        btn.textContent = ctaLink.textContent;
        if (ctaLink.target) btn.target = ctaLink.target;
        decorateCTA(btn);
        bodyDiv.appendChild(btn);
      }

      li.appendChild(imageDiv);
      li.appendChild(bodyDiv);
      ul.appendChild(li);
    });

    ul.dataset.cardCount = ul.children.length;
    block.textContent = '';
    if (header) {
      block.appendChild(header);
    }
    block.appendChild(ul);
    return;
  }

  // Original single-column format handling (vertical structure)

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.className = 'product-card';
    if (isSale) li.classList.add('sale');

    const cells = [...row.children];
    let imageSet = false;
    let nameSet = false;
    let ratingSet = false;
    let priceInfo = { current: '', original: '', savings: '', isSale: false };

    // Create structure
    const imageDiv = document.createElement('div');
    imageDiv.className = 'product-card-image';

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'product-card-body';

    cells.forEach((cell) => {
      const pic = cell.querySelector('picture');
      const strong = cell.querySelector('strong');
      const link = cell.querySelector('a');
      const text = cell.textContent.trim();

      // Image
      if (pic && !imageSet) {
        imageDiv.appendChild(pic.cloneNode(true));
        imageSet = true;
        return;
      }

      // Product name (bold text)
      if (strong && !nameSet) {
        const h3 = document.createElement('h3');
        h3.className = 'product-name';
        h3.textContent = strong.textContent;
        bodyDiv.appendChild(h3);
        nameSet = true;
        return;
      }

      // Rating (contains stars or rating number)
      if ((text.includes('★') || text.includes('☆') || /\d+\.\d+/.test(text)) && !ratingSet) {
        const rating = parseRating(text);
        const ratingDiv = document.createElement('div');
        ratingDiv.className = 'product-rating';
        ratingDiv.innerHTML = `
          <span class="stars" aria-label="${rating.rating} out of 5 stars">${rating.stars}</span>
          ${rating.count ? `<span class="review-count">(${rating.count})</span>` : ''}
        `;
        bodyDiv.appendChild(ratingDiv);
        ratingSet = true;
        return;
      }

      // Price - handle multiple price lines
      if (text.includes('$') || text.toLowerCase().includes('now') || text.toLowerCase().includes('save')) {
        const parsed = parsePrice(text);
        if (parsed.current) priceInfo.current = parsed.current;
        if (parsed.original) priceInfo.original = parsed.original;
        if (parsed.savings) priceInfo.savings = parsed.savings;
        if (parsed.isSale) priceInfo.isSale = true;
        return;
      }

      // CTA button (link)
      if (link) {
        const btn = document.createElement('a');
        btn.className = 'product-cta button';
        btn.href = link.href;
        btn.textContent = link.textContent;
        // Decorate CTA with appropriate icon and sanitize text
        decorateCTA(btn);
        bodyDiv.appendChild(btn);
      }
    });

    // Add price after collecting all price info
    if (priceInfo.current || priceInfo.original) {
      const priceDiv = document.createElement('div');
      priceDiv.className = 'product-price';

      if (priceInfo.isSale || isSale) {
        li.classList.add('sale');
        priceDiv.innerHTML = `
          <span class="sale-price">${priceInfo.current}</span>
          ${priceInfo.savings ? `<span class="savings">Save ${priceInfo.savings}</span>` : ''}
          ${priceInfo.original ? `<span class="original-price">Was ${priceInfo.original}</span>` : ''}
        `;
      } else {
        priceDiv.innerHTML = `<span class="current-price">${priceInfo.current}</span>`;
      }

      // Insert price before CTA button
      const cta = bodyDiv.querySelector('.product-cta');
      if (cta) {
        bodyDiv.insertBefore(priceDiv, cta);
      } else {
        bodyDiv.appendChild(priceDiv);
      }
    }

    li.appendChild(imageDiv);
    li.appendChild(bodyDiv);
    ul.appendChild(li);
  });

  // Add card count for CSS grid layout
  ul.dataset.cardCount = ul.children.length;

  block.textContent = '';
  if (header) {
    block.appendChild(header);
  }
  block.appendChild(ul);
}
