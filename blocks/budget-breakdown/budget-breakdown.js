/**
 * Budget Breakdown Block
 * Shows transparent pricing information for budget-conscious users.
 * Card-based tier layout with color-coded accents.
 */

export default function decorate(block) {
  // Expected structure from AI:
  // Row 1: Title
  // Row 2+: Price tiers (tier name | products with prices)

  const rows = [...block.children];
  if (rows.length < 2) {
    console.warn('budget-breakdown: Expected at least 2 rows');
    return;
  }

  const title = rows[0]?.textContent?.trim() || 'Your Options by Budget';

  // Clear the block
  block.innerHTML = '';

  // Create header
  const header = document.createElement('div');
  header.className = 'budget-header';

  const icon = document.createElement('div');
  icon.className = 'budget-icon';
  icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>';
  header.appendChild(icon);

  const titleEl = document.createElement('h2');
  titleEl.className = 'budget-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  block.appendChild(header);

  // Create tiers grid
  const tiersGrid = document.createElement('div');
  tiersGrid.className = 'budget-tiers-grid';

  // Process each tier row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cells = [...row.children];

    if (cells.length < 2) continue;

    const tierName = cells[0]?.textContent?.trim() || 'Price Tier';
    const tierContentEl = cells[1];

    // Determine tier type for styling
    let tierType = 'standard';
    if (/under|budget|entry|\$[0-3]/i.test(tierName)) tierType = 'budget';
    else if (/premium|pro|high|\$[5-9]/i.test(tierName)) tierType = 'premium';
    else if (/refurb|certified|reconditioned/i.test(tierName)) tierType = 'refurbished';

    const tier = document.createElement('div');
    tier.className = `budget-tier tier-${tierType}`;

    // Tier header with name
    const tierHeader = document.createElement('div');
    tierHeader.className = 'tier-header';

    const tierLabel = document.createElement('span');
    tierLabel.className = 'tier-label';
    tierLabel.textContent = tierName;
    tierHeader.appendChild(tierLabel);

    tier.appendChild(tierHeader);

    // Parse products from content
    const tierBody = document.createElement('div');
    tierBody.className = 'tier-body';

    // Get list items or parse text
    const listItems = tierContentEl.querySelectorAll('li');
    if (listItems.length > 0) {
      listItems.forEach((li) => {
        const productCard = createProductCard(li.textContent);
        if (productCard) tierBody.appendChild(productCard);
      });
    } else {
      // Parse text content for products
      const text = tierContentEl.textContent;
      const lines = text.split(/[•\n]/).filter((l) => l.trim());
      lines.forEach((line) => {
        const productCard = createProductCard(line);
        if (productCard) tierBody.appendChild(productCard);
      });
    }

    tier.appendChild(tierBody);
    tiersGrid.appendChild(tier);
  }

  block.appendChild(tiersGrid);

  // Add value proposition note
  const valueNote = document.createElement('div');
  valueNote.className = 'budget-value-note';
  valueNote.innerHTML = `
    <div class="value-note-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
    </div>
    <div class="value-note-text">
      <strong>Pro tip:</strong> Vitamix blenders last 10-20+ years. A $400 blender used daily for 10 years costs just <strong>$0.11/day</strong>.
    </div>
  `;
  block.appendChild(valueNote);

  // Add refurbished CTA
  const refurbCta = document.createElement('a');
  refurbCta.className = 'budget-refurb-cta';
  refurbCta.href = 'https://www.vitamix.com/shop/certified-reconditioned';
  refurbCta.target = '_blank';
  refurbCta.innerHTML = `
    <span class="refurb-badge">SAVE UP TO 40%</span>
    <span class="refurb-text">Shop Certified Reconditioned</span>
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
  `;
  block.appendChild(refurbCta);
}

function createProductCard(text) {
  if (!text || !text.trim()) return null;

  const card = document.createElement('div');
  card.className = 'product-item';

  // Try to parse "Product Name: $XXX" or "Product Name $XXX" format
  const priceMatch = text.match(/(.+?)[:–-]?\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);

  if (priceMatch) {
    const name = priceMatch[1].trim().replace(/^[•\-]\s*/, '');
    const price = priceMatch[2];

    card.innerHTML = `
      <span class="product-name">${name}</span>
      <span class="product-price">$${price}</span>
    `;
  } else {
    // Just show the text as-is
    card.innerHTML = `<span class="product-name">${text.trim().replace(/^[•\-]\s*/, '')}</span>`;
  }

  return card;
}
