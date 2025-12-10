/**
 * Product Hero Block
 *
 * Split hero with product details on left, product image on right.
 * Supports two structures:
 *
 * 1. Two-column table structure (authored):
 * | Product Hero |
 * | [image] | <h1>Title</h1><p>Desc</p><p><strong>Price</strong></p><p>Specs</p><p><a>CTA</a></p> |
 *
 * 2. Flat/row structure (AI-generated):
 * | Product Hero |
 * | <h1>Title</h1> |
 * | <picture>...</picture> |
 * | <p>Description</p> |
 * | ... |
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  let picture = null;
  let img = null;
  let h1 = null;
  let paragraphs = [];

  // Check if this is a two-column structure (first row has multiple cells with distinct content)
  const firstRow = rows[0];
  const cols = firstRow ? [...firstRow.children] : [];
  const hasTwoColumnStructure = cols.length >= 2
    && (cols[0]?.querySelector('picture, img') || cols[1]?.querySelector('picture, img'));

  if (hasTwoColumnStructure) {
    // Traditional two-column table structure
    let imageCol = cols[0];
    let contentCol = cols[1];

    // Check if image is in col2 instead
    if (cols[1]?.querySelector('picture, img') && !cols[0]?.querySelector('picture, img')) {
      imageCol = cols[1];
      contentCol = cols[0];
    }

    picture = imageCol?.querySelector('picture');
    img = imageCol?.querySelector('img');
    // Look for any heading, prefer h1 but fall back to h2, h3
    h1 = contentCol?.querySelector('h1') || contentCol?.querySelector('h2') || contentCol?.querySelector('h3');
    paragraphs = contentCol?.querySelectorAll('p') || [];
  } else {
    // Flat/row structure - search entire block for content
    picture = block.querySelector('picture');
    img = block.querySelector('img');
    // Look for any heading, prefer h1 but fall back to h2, h3
    h1 = block.querySelector('h1') || block.querySelector('h2') || block.querySelector('h3');
    paragraphs = block.querySelectorAll('p') || [];
  }

  // Parse paragraphs into: description, price, specs, ctas
  let description = '';
  let price = '';
  let specs = '';
  const ctas = [];

  // Price pattern: matches $X, $X.XX, $X,XXX.XX formats
  const pricePattern = /^\$[\d,]+(?:\.\d{2})?$/;

  paragraphs.forEach((p) => {
    const link = p.querySelector('a');
    const strong = p.querySelector('strong');
    const text = p.textContent.trim();

    if (link) {
      ctas.push({
        text: link.textContent.trim(),
        href: link.href,
        ctaType: link.getAttribute('data-cta-type'),
        generationHint: link.getAttribute('data-generation-hint'),
      });
    } else if (strong && !price) {
      // Price in strong tag
      price = strong.textContent.trim();
    } else if (pricePattern.test(text) && !price) {
      // Price as plain text matching pattern
      price = text;
    } else if (text.includes('|')) {
      // Specs with pipe separator
      specs = text;
    } else if (text && !description) {
      // First non-price, non-spec text is description
      description = text;
    }
  });

  // Only rebuild if we found meaningful content (title or image)
  // This prevents clearing the block when parsing fails
  if (!h1 && !picture && !img) {
    console.warn('[product-hero] No content found, preserving original markup');
    return;
  }

  // Build new structure
  block.innerHTML = '';

  // Left side - details
  const detailsDiv = document.createElement('div');
  detailsDiv.className = 'product-hero-details';

  if (h1) {
    const titleEl = document.createElement('h1');
    titleEl.className = 'product-hero-title';
    titleEl.textContent = h1.textContent.trim();
    detailsDiv.appendChild(titleEl);
  }

  if (description) {
    const descEl = document.createElement('p');
    descEl.className = 'product-hero-description';
    descEl.textContent = description;
    detailsDiv.appendChild(descEl);
  }

  if (price) {
    const priceEl = document.createElement('p');
    priceEl.className = 'product-hero-price';
    priceEl.textContent = price;
    detailsDiv.appendChild(priceEl);
  }

  if (specs) {
    const specsEl = document.createElement('p');
    specsEl.className = 'product-hero-specs';
    specsEl.textContent = specs;
    detailsDiv.appendChild(specsEl);
  }

  // Add CTA buttons
  ctas.forEach((cta, index) => {
    const btn = document.createElement('a');
    btn.href = cta.href;
    btn.textContent = cta.text;
    btn.className = index === 0 ? 'product-hero-cta primary' : 'product-hero-cta secondary';
    // Preserve explore CTA attributes for contextual navigation
    if (cta.ctaType) {
      btn.setAttribute('data-cta-type', cta.ctaType);
    }
    if (cta.generationHint) {
      btn.setAttribute('data-generation-hint', cta.generationHint);
    }
    detailsDiv.appendChild(btn);
  });

  // Right side - image
  const imageDiv = document.createElement('div');
  imageDiv.className = 'product-hero-image';
  if (picture) {
    imageDiv.appendChild(picture.cloneNode(true));
  } else if (img) {
    imageDiv.appendChild(img.cloneNode(true));
  }

  block.appendChild(detailsDiv);
  block.appendChild(imageDiv);
}
