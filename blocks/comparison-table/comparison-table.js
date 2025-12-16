/**
 * Comparison Table Block
 *
 * Side-by-side product comparison with specs and winner indicators.
 * Supports 2-4 products dynamically.
 *
 * Content Model (DA Table):
 * | Comparison Table |
 * |------------------|
 * |                  | A3500 | A2500 | E310  |  <- Header row
 * | **Price**        | $649  | $549  | $349  |  <- Spec rows
 * | **Motor**        | 2.2HP | 2.2HP | 2.0HP |
 */

/**
 * Generate a Vitamix product URL from a product name
 * @param {string} productName - Product name like "Ascent® X5" or "Vitamix A3500"
 * @returns {string} URL to the product page
 */
function generateProductUrl(productName) {
  // Remove "Vitamix" prefix if present
  let slug = productName.replace(/^Vitamix\s*/i, '');
  // Remove trademark symbols
  slug = slug.replace(/[®™©]/g, '');
  // Convert to lowercase
  slug = slug.toLowerCase();
  // Replace spaces with hyphens
  slug = slug.replace(/\s+/g, '-');
  // Remove any remaining special characters except hyphens
  slug = slug.replace(/[^a-z0-9-]/g, '');
  // Remove consecutive hyphens
  slug = slug.replace(/-+/g, '-');
  // Trim hyphens from start/end
  slug = slug.replace(/^-|-$/g, '');

  return `https://www.vitamix.com/us/en_us/shop/${slug}`;
}

export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length === 0) return;

  // Create table structure
  const table = document.createElement('table');
  table.className = 'comparison-table-grid';

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // Process first row as header (product names)
  const headerRow = rows[0];
  if (headerRow) {
    const tr = document.createElement('tr');
    const cells = [...headerRow.children];

    cells.forEach((cell, idx) => {
      const th = document.createElement('th');
      th.scope = idx === 0 ? 'col' : 'col';

      // First cell is empty or "vs" label
      if (idx === 0) {
        th.className = 'comparison-table-corner';
        th.textContent = cell.textContent.trim() || '';
      } else {
        th.className = 'comparison-table-product';
        // Extract product name (might be in strong tag or link)
        const strong = cell.querySelector('strong');
        const existingLink = cell.querySelector('a');
        const productName = strong ? strong.textContent : cell.textContent.trim();

        // Create link to product page
        const link = document.createElement('a');
        link.textContent = productName;
        // Use existing link href if available, otherwise generate from product name
        link.href = existingLink ? existingLink.href : generateProductUrl(productName);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        th.appendChild(link);
      }
      tr.appendChild(th);
    });

    thead.appendChild(tr);
  }

  // Track number of products for colspan
  const productCount = rows[0] ? [...rows[0].children].length : 1;

  // Detect recommended product from data attribute or recommendation rows
  let recommendedProductIdx = -1;
  const recommendedAttr = block.dataset.recommended;

  // Check data-recommended attribute first
  if (recommendedAttr) {
    const headerCells = rows[0] ? [...rows[0].children] : [];
    headerCells.forEach((cell, idx) => {
      if (idx > 0) {
        const cellText = cell.textContent.toLowerCase();
        if (cellText.includes(recommendedAttr.toLowerCase())) {
          recommendedProductIdx = idx;
        }
      }
    });
  }

  // If no data attribute, scan for "Best for" or "Recommended" rows to find the recommended product
  if (recommendedProductIdx === -1) {
    for (const row of rows.slice(1)) {
      const firstCell = row.children[0];
      const firstCellText = firstCell ? firstCell.textContent.trim().toLowerCase() : '';
      if (firstCellText.startsWith('best for') || firstCellText.startsWith('recommended')
          || firstCellText.startsWith('our pick')) {
        // Find which column has the product name in the recommendation
        const recommendationText = firstCell.textContent.toLowerCase();
        const headerCells = rows[0] ? [...rows[0].children] : [];
        headerCells.forEach((cell, idx) => {
          if (idx > 0) {
            const productName = cell.textContent.trim().toLowerCase();
            // Extract first word/model name for matching
            const productKeywords = productName.split(/[\s®™]+/).filter((w) => w.length > 1);
            for (const keyword of productKeywords) {
              if (recommendationText.includes(keyword) && keyword.length > 2) {
                recommendedProductIdx = idx;
                break;
              }
            }
          }
        });
        break;
      }
    }
  }

  // Apply recommended styling to header if found
  if (recommendedProductIdx > 0 && thead.children[0]) {
    const headerCells = thead.children[0].children;
    if (headerCells[recommendedProductIdx]) {
      headerCells[recommendedProductIdx].classList.add('recommended-column');

      // Add ribbon badge
      const ribbon = document.createElement('span');
      ribbon.className = 'recommended-ribbon';
      ribbon.textContent = 'BEST PICK';
      headerCells[recommendedProductIdx].appendChild(ribbon);
    }
  }

  // Separate recommendation rows from spec rows
  const specRows = [];
  const recommendationRows = [];

  rows.slice(1).forEach((row) => {
    const firstCell = row.children[0];
    const firstCellText = firstCell ? firstCell.textContent.trim().toLowerCase() : '';
    const cells = [...row.children];

    // Check if this looks like a recommendation row
    const isRecommendationKeyword = firstCellText.startsWith('best for')
      || firstCellText.startsWith('recommended')
      || firstCellText.startsWith('our pick')
      || firstCellText.startsWith('winner');

    // Only treat as recommendation if it's a single-cell format with colon
    // (e.g., "Best for smoothies: A3500") OR if other cells are empty.
    // If other cells have content, it's a multi-column spec row showing "Best For" per product.
    const hasContentInOtherCells = cells.slice(1).some((cell) => cell.textContent.trim().length > 0);
    const hasColonFormat = firstCellText.includes(':');

    if (isRecommendationKeyword && (hasColonFormat || !hasContentInOtherCells)) {
      recommendationRows.push(row);
    } else {
      specRows.push(row);
    }
  });

  // Process spec rows
  specRows.forEach((row) => {
    const tr = document.createElement('tr');
    const cells = [...row.children];

    cells.forEach((cell, idx) => {
      const td = document.createElement(idx === 0 ? 'th' : 'td');
      if (idx === 0) {
        td.scope = 'row';
        td.className = 'comparison-table-spec';
        // Spec name - might be in strong tag
        const strong = cell.querySelector('strong');
        td.textContent = strong ? strong.textContent : cell.textContent.trim();
      } else {
        td.className = 'comparison-table-value';

        // Add recommended column class if this is the recommended product column
        if (idx === recommendedProductIdx) {
          td.classList.add('recommended-column');
        }

        const text = cell.textContent.trim();

        // Check for winner indicators
        if (text.includes('✓')) {
          td.classList.add('winner');
        }
        if (text.includes('✗')) {
          td.classList.add('missing');
        }

        // Parse value and indicator
        const valueSpan = document.createElement('span');
        valueSpan.className = 'value';
        valueSpan.textContent = text.replace(/[✓✗]/g, '').trim();

        td.appendChild(valueSpan);

        // Add winner/missing indicator
        if (text.includes('✓')) {
          const indicator = document.createElement('span');
          indicator.className = 'winner-indicator';
          indicator.setAttribute('aria-label', 'Best in category');
          indicator.textContent = '✓';
          td.appendChild(indicator);
        }
        if (text.includes('✗')) {
          const indicator = document.createElement('span');
          indicator.className = 'missing-indicator';
          indicator.setAttribute('aria-label', 'Not available');
          indicator.textContent = '✗';
          td.appendChild(indicator);
        }
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  // Process recommendation rows as tfoot
  if (recommendationRows.length > 0) {
    const tfoot = document.createElement('tfoot');

    recommendationRows.forEach((row) => {
      // Parse recommendation text: "Best for X: Product Name"
      const firstCell = row.children[0];
      const fullText = firstCell ? firstCell.textContent.trim() : '';

      // Skip if recommendation is "none of them" or similar non-recommendation
      const lowerText = fullText.toLowerCase();
      if (lowerText.includes('none of') || lowerText.includes('no clear')
          || lowerText.includes('not recommended') || lowerText.includes('n/a')
          || lowerText.includes('no winner') || lowerText.includes('no best')) {
        return; // Skip this recommendation row
      }

      const tr = document.createElement('tr');
      tr.className = 'comparison-table-recommendation';

      const td = document.createElement('td');
      td.colSpan = productCount;
      td.className = 'comparison-table-recommendation-cell';

      // Try to extract the reason and product name
      const colonIndex = fullText.indexOf(':');
      if (colonIndex > -1) {
        const reason = fullText.substring(0, colonIndex).trim();
        const productNameFull = fullText.substring(colonIndex + 1).trim();

        // Extract clean product name (without parenthetical notes) for URL
        // e.g., "Propel® 750 Classic Bundle (has Hot Soup Program)" -> "Propel® 750 Classic Bundle"
        const cleanProductName = productNameFull.replace(/\s*\([^)]*\)\s*$/, '').trim();

        // Create recommendation banner content
        const icon = document.createElement('span');
        icon.className = 'recommendation-icon';
        icon.textContent = '🏆';
        icon.setAttribute('aria-hidden', 'true');

        const textWrapper = document.createElement('span');
        textWrapper.className = 'recommendation-text';

        const reasonSpan = document.createElement('span');
        reasonSpan.className = 'recommendation-reason';
        reasonSpan.textContent = reason;

        const productSpan = document.createElement('span');
        productSpan.className = 'recommendation-product';

        // Make product name a link - display full name but use clean name for URL
        const productLink = document.createElement('a');
        productLink.textContent = productNameFull;
        productLink.href = generateProductUrl(cleanProductName);
        productLink.target = '_blank';
        productLink.rel = 'noopener noreferrer';
        productSpan.appendChild(productLink);

        textWrapper.appendChild(reasonSpan);
        textWrapper.appendChild(document.createTextNode(': '));
        textWrapper.appendChild(productSpan);

        td.appendChild(icon);
        td.appendChild(textWrapper);
      } else {
        // No colon, just show the text with icon
        const icon = document.createElement('span');
        icon.className = 'recommendation-icon';
        icon.textContent = '🏆';
        icon.setAttribute('aria-hidden', 'true');

        const textSpan = document.createElement('span');
        textSpan.className = 'recommendation-text';
        textSpan.textContent = fullText;

        td.appendChild(icon);
        td.appendChild(textSpan);
      }

      tr.appendChild(td);
      tfoot.appendChild(tr);
    });

    // Only append tfoot if it has rows
    if (tfoot.children.length > 0) {
      table.appendChild(tfoot);
    }
  }

  // Track number of products for responsive styling
  block.dataset.products = productCount - 1;

  block.textContent = '';
  block.appendChild(table);
}
