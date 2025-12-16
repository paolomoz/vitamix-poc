/**
 * Best Pick Block
 *
 * Prominent "Our Top Pick" callout that appears BEFORE comparison tables.
 * Highlights the recommended product based on user's specific needs.
 *
 * Content Model (DA Table):
 * | Best Pick |
 * |-----------|
 * | BEST FOR [USE CASE] |           <- Eyebrow
 * | ## Product Name |                <- Headline
 * | Rationale why this is best |     <- Body
 * | $XXX | Warranty |                <- Price/Details
 * | [image] |                        <- Product image
 * | [[View on Vitamix]] |            <- CTA
 */

export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length === 0) return;

  // Create wrapper structure
  const wrapper = document.createElement('div');
  wrapper.className = 'best-pick-wrapper';

  // Badge
  const badge = document.createElement('div');
  badge.className = 'best-pick-badge';
  badge.textContent = 'OUR TOP PICK';
  wrapper.appendChild(badge);

  // Content container (two-column: content + image)
  const container = document.createElement('div');
  container.className = 'best-pick-container';

  const contentCol = document.createElement('div');
  contentCol.className = 'best-pick-content';

  const imageCol = document.createElement('div');
  imageCol.className = 'best-pick-image';

  // Parse rows
  rows.forEach((row, index) => {
    const cells = [...row.children];
    const firstCell = cells[0];
    if (!firstCell) return;

    const text = firstCell.textContent.trim();
    const picture = firstCell.querySelector('picture');
    const link = firstCell.querySelector('a');

    // Check for image
    if (picture) {
      imageCol.appendChild(picture.cloneNode(true));
      return;
    }

    // Check for CTA (link/button)
    if (link && (link.classList.contains('button') || cells.length === 1)) {
      const ctaWrapper = document.createElement('div');
      ctaWrapper.className = 'best-pick-cta';
      const ctaLink = link.cloneNode(true);
      ctaLink.classList.add('button', 'primary');
      ctaWrapper.appendChild(ctaLink);
      contentCol.appendChild(ctaWrapper);
      return;
    }

    // Check for eyebrow (all uppercase, short)
    if (text === text.toUpperCase() && text.length < 60 && !text.startsWith('$')) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'best-pick-eyebrow';
      eyebrow.textContent = text;
      contentCol.appendChild(eyebrow);
      return;
    }

    // Check for headline (h2)
    const h2 = firstCell.querySelector('h2');
    if (h2) {
      const headline = document.createElement('h2');
      headline.className = 'best-pick-headline';
      headline.textContent = h2.textContent;
      contentCol.appendChild(headline);
      return;
    }

    // Check for price/warranty (contains $)
    if (text.includes('$')) {
      const details = document.createElement('div');
      details.className = 'best-pick-details';

      // Parse price and warranty
      const parts = text.split('|').map((p) => p.trim());

      if (parts[0]) {
        const price = document.createElement('span');
        price.className = 'best-pick-price';
        price.textContent = parts[0];
        details.appendChild(price);
      }

      if (parts[1]) {
        const warranty = document.createElement('span');
        warranty.className = 'best-pick-warranty';
        warranty.textContent = parts[1];
        details.appendChild(warranty);
      }

      contentCol.appendChild(details);
      return;
    }

    // Default: rationale/body text
    if (text && index > 0) {
      const rationale = document.createElement('p');
      rationale.className = 'best-pick-rationale';
      rationale.textContent = text;
      contentCol.appendChild(rationale);
    }
  });

  container.appendChild(contentCol);
  container.appendChild(imageCol);
  wrapper.appendChild(container);

  block.textContent = '';
  block.appendChild(wrapper);
}
