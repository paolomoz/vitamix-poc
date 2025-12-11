/**
 * Specs Table Block
 *
 * Vertical list layout with label/value pairs.
 * Includes an h3 title with the model name.
 *
 * Content Model (generative):
 * <h3>Model Name Specifications</h3>
 * Each row is a spec with two cells: label | value
 *
 * Content Model (DA Table):
 * | Specs Table |
 * |-------------|
 * | Motor | 2.2 HP Peak |
 * | Container | 64 oz |
 */
export default function decorate(block) {
  const children = [...block.children];

  // Check if there's already an h3 title
  let hasTitle = false;
  children.forEach((child) => {
    if (child.tagName === 'H3') {
      hasTitle = true;
      child.classList.add('specs-table-title');
    }
  });

  // If no title exists, try to create one from context
  if (!hasTitle) {
    let productName = '';

    // First, check for data-product-name attribute (set by server)
    const dataProductName = block.dataset.productName;
    if (dataProductName) {
      productName = dataProductName;
    }

    // Fallback: try to get product name from the page or nearby blocks
    if (!productName) {
      const heroHeadline = document.querySelector('.hero h1, .product-hero h1');
      if (heroHeadline) {
        const heroText = heroHeadline.textContent || '';
        // Look for Vitamix model patterns like A3500, E310, 5200, etc.
        const modelMatch = heroText.match(/(?:Vitamix\s+)?([A-Z]?\d{3,4}[A-Za-z]*|Quiet One|Ascent|Explorian)/i);
        if (modelMatch) {
          productName = modelMatch[0];
        }
      }
    }

    // Fallback: try page title
    if (!productName) {
      const pageTitle = document.title || '';
      const titleMatch = pageTitle.match(/(?:Vitamix\s+)?([A-Z]?\d{3,4}[A-Za-z]*|Quiet One|Ascent|Explorian)/i);
      if (titleMatch) {
        productName = titleMatch[0];
      }
    }

    // Fallback: extract from the specs content itself
    if (!productName) {
      const specsContent = block.textContent || '';
      // Look for model patterns - must be standalone (not part of larger numbers like "37,000")
      // Match patterns like: A3500, E310, 5200, Quiet One, Ascent X5, Explorian E310
      const contentMatch = specsContent.match(/\b(?:Vitamix\s+)?(?:Quiet One|Ascent(?:\s*®?\s*)?(?:X\d+|Series)?|Explorian\s*E?\d*|[A-Z]\d{3,4}[A-Za-z]*|(?<![,\d])5200(?![,\d]))\b/i);
      if (contentMatch) {
        productName = contentMatch[0].trim();
      }
    }

    // Fallback: check for commercial/comparison context
    if (!productName) {
      const specsContent = block.textContent || '';
      if (specsContent.toLowerCase().includes('commercial') || specsContent.toLowerCase().includes('vs')) {
        productName = 'Commercial Blender';
      }
    }

    // Create and insert the h3 title
    const title = document.createElement('h3');
    title.className = 'specs-table-title';
    title.textContent = productName ? `${productName} Specifications` : 'Product Specifications';
    block.insertBefore(title, block.firstChild);
  }

  // Process spec rows
  children.forEach((child) => {
    // Skip h3 title elements
    if (child.tagName === 'H3') {
      return;
    }

    // Handle div rows
    if (child.tagName === 'DIV') {
      const cells = [...child.children];

      // Handle two-cell rows (label | value)
      if (cells.length === 2) {
        cells[0].classList.add('specs-table-label');
        cells[1].classList.add('specs-table-value');
      } else if (cells.length === 1) {
        // Handle single cell with strong/text pattern (DA authoring)
        const cell = cells[0];
        const strong = cell.querySelector('strong');
        if (strong) {
          const label = document.createElement('div');
          label.className = 'specs-table-label';
          label.textContent = strong.textContent;

          const value = document.createElement('div');
          value.className = 'specs-table-value';
          const fullText = cell.textContent;
          value.textContent = fullText.replace(strong.textContent, '').trim();

          child.textContent = '';
          child.appendChild(label);
          child.appendChild(value);
        }
      }
    }
  });
}
