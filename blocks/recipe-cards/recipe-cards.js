/**
 * Recipe Cards Block
 * Displays recipes in a grid layout with images
 *
 * Content Model (DA Table):
 * | Recipe Cards |
 * |--------------|
 * | [header with title and subtitle] |
 * | [image] | Recipe Title | Description |
 * | [image] | Recipe Title | Description |
 *
 * Or pre-structured (AI-generated):
 * <div class="recipe-cards">
 *   <div class="rcheader">...</div>
 *   <div class="recipe-card" data-href="...">...</div>
 * </div>
 */
export default function decorate(block) {
  // Check if already structured as cards (AI-generated content)
  const existingCards = block.querySelectorAll('.recipe-card');
  if (existingCards.length > 0) {
    block.classList.add('recipe-cards-grid');
    block.dataset.cardCount = existingCards.length;

    // Preserve and style the header if present
    const header = block.querySelector('.rcheader');
    if (header) {
      header.classList.add('recipe-cards-header');
    }

    existingCards.forEach((card) => {
      // Make images lazy load
      card.querySelectorAll('img').forEach((img) => {
        img.loading = 'lazy';
      });

      // Fix title/description structure if needed (DA may concatenate them)
      const titleEl = card.querySelector('.recipe-card-title');
      const contentDiv = card.querySelector('.recipe-card-content');
      if (titleEl && contentDiv) {
        const existingLink = titleEl.querySelector('a');
        const existingDesc = contentDiv.querySelector('.recipe-card-description');

        // Look for backup link element (DA may preserve this better)
        const backupLinkEl = contentDiv.querySelector('.recipe-card-link');
        const backupLink = backupLinkEl?.querySelector('a');
        const backupHref = backupLink?.href;

        // Hide backup link element if present (we only use it to extract URL)
        if (backupLinkEl) {
          backupLinkEl.style.display = 'none';
        }

        // Get href from backup link, data-href, or existing link (in order of preference)
        const href = backupHref || card.dataset.href || existingLink?.href;

        // If title has no link and no separate description exists,
        // try to split "Title X minutes, difficulty" pattern
        if (!existingLink && !existingDesc) {
          const titleText = titleEl.textContent?.trim() || '';
          // Match pattern: "Recipe Name X minutes, difficulty" or "Recipe Name X minutes"
          // Handle various separators: comma, bullet (•), newline, or just space
          // The \s+ handles newlines and whitespace between title and time
          const match = titleText.match(/^(.+?)\s+(\d+\s*(?:minutes?|mins?|hours?|hrs?)[\s•,·-]*\w*)\s*$/i);

          if (match) {
            const [, recipeName, description] = match;

            // Rebuild title with link if we have href
            titleEl.textContent = '';
            if (href) {
              const link = document.createElement('a');
              link.href = href;
              link.target = '_blank';
              link.title = recipeName.trim();
              link.textContent = recipeName.trim();
              titleEl.appendChild(link);
            } else {
              titleEl.textContent = recipeName.trim();
            }

            // Create description element
            const descEl = document.createElement('p');
            descEl.className = 'recipe-card-description';
            descEl.textContent = description.trim();
            contentDiv.appendChild(descEl);
          } else if (href) {
            // No pattern match but we have href, still add the link
            const text = titleEl.textContent?.trim() || '';
            titleEl.textContent = '';
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.title = text;
            link.textContent = text;
            titleEl.appendChild(link);
          }
        } else if (!existingLink && href) {
          // Description exists but title has no link - add link to title
          const text = titleEl.textContent?.trim() || '';
          titleEl.textContent = '';
          const link = document.createElement('a');
          link.href = href;
          link.target = '_blank';
          link.title = text;
          link.textContent = text;
          titleEl.appendChild(link);
        }
      }

      // Make entire card clickable if it has data-href or contains a link
      const href = card.dataset.href || card.querySelector('a')?.href;
      if (href && card.tagName !== 'A') {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
          // Don't navigate if clicking on the actual link
          if (e.target.tagName === 'A') return;
          window.open(href, '_blank');
        });
      }
    });
    return;
  }

  // Check if there's a ul with li items
  const list = block.querySelector('ul');
  if (list) {
    const items = list.querySelectorAll('li');
    if (items.length > 0) {
      block.innerHTML = '';
      block.classList.add('recipe-cards-grid');

      items.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'recipe-card';

        // Try to find image
        const img = item.querySelector('img');
        if (img) {
          const imageDiv = document.createElement('div');
          imageDiv.className = 'recipe-card-image';
          img.loading = 'lazy';
          imageDiv.appendChild(img.cloneNode(true));
          card.appendChild(imageDiv);
        }

        // Get text content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'recipe-card-content';

        const title = item.querySelector('h3, h4, strong, a');
        if (title) {
          const titleEl = document.createElement('h4');
          titleEl.className = 'recipe-card-title';
          titleEl.textContent = title.textContent;
          contentDiv.appendChild(titleEl);
        }

        // Get remaining text as description
        const textContent = item.textContent?.replace(title?.textContent || '', '').trim();
        if (textContent) {
          const desc = document.createElement('p');
          desc.className = 'recipe-card-description';
          desc.textContent = textContent.slice(0, 100);
          contentDiv.appendChild(desc);
        }

        card.appendChild(contentDiv);
        block.appendChild(card);
      });

      block.dataset.cardCount = items.length;
      return;
    }
  }

  // Fallback: build from DA table rows
  const rows = [...block.children];
  const cards = [];
  let headerEl = null;

  rows.forEach((row) => {
    // Check if this row is the header (contains rcheader class or h3 with rctitle)
    if (row.querySelector('.rcheader, .rctitle') || row.classList.contains('rcheader')) {
      headerEl = row;
      headerEl.classList.add('recipe-cards-header');
      return;
    }

    const cells = [...row.children];
    if (cells.length === 0) return;

    const card = document.createElement('div');
    card.className = 'recipe-card';

    // Find link in the row for making card clickable
    const link = row.querySelector('a');
    if (link?.href) {
      card.dataset.href = link.href;
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;
        window.open(link.href, '_blank');
      });
    }

    // First cell might be image
    const firstCell = cells[0];
    const picture = firstCell?.querySelector('picture');
    const img = firstCell?.querySelector('img');

    if (picture || img) {
      const imageDiv = document.createElement('div');
      imageDiv.className = 'recipe-card-image';
      if (picture) {
        const clonedPicture = picture.cloneNode(true);
        clonedPicture.querySelector('img')?.setAttribute('loading', 'lazy');
        imageDiv.appendChild(clonedPicture);
      } else if (img) {
        img.loading = 'lazy';
        imageDiv.appendChild(img.cloneNode(true));
      }
      card.appendChild(imageDiv);
      cells.shift();
    }

    // Content from remaining cells
    const contentDiv = document.createElement('div');
    contentDiv.className = 'recipe-card-content';

    cells.forEach((cell, i) => {
      // Check for existing structured content
      const existingTitle = cell.querySelector('.recipe-card-title, h4, h3');
      const existingDesc = cell.querySelector('.recipe-card-description, p');

      if (existingTitle) {
        const titleEl = document.createElement('h4');
        titleEl.className = 'recipe-card-title';
        // Preserve link if present
        const titleLink = existingTitle.querySelector('a');
        if (titleLink) {
          titleEl.appendChild(titleLink.cloneNode(true));
        } else {
          titleEl.textContent = existingTitle.textContent;
        }
        contentDiv.appendChild(titleEl);
      }

      if (existingDesc) {
        const desc = document.createElement('p');
        desc.className = 'recipe-card-description';
        desc.textContent = existingDesc.textContent;
        contentDiv.appendChild(desc);
      }

      // Fallback to simple text parsing
      if (!existingTitle && !existingDesc) {
        const text = cell.textContent?.trim();
        if (!text) return;

        if (i === 0) {
          const title = document.createElement('h4');
          title.className = 'recipe-card-title';
          title.textContent = text;
          contentDiv.appendChild(title);
        } else {
          const desc = document.createElement('p');
          desc.className = 'recipe-card-description';
          desc.textContent = text.slice(0, 100);
          contentDiv.appendChild(desc);
        }
      }
    });

    if (contentDiv.children.length > 0) {
      card.appendChild(contentDiv);
      cards.push(card);
    }
  });

  if (cards.length > 0 || headerEl) {
    block.innerHTML = '';
    block.classList.add('recipe-cards-grid');

    if (headerEl) {
      block.appendChild(headerEl);
    }

    block.dataset.cardCount = cards.length;
    cards.forEach((card) => block.appendChild(card));
  }
}
