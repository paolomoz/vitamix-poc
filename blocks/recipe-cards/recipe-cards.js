/**
 * Recipe Cards Block
 * Displays recipes in a grid layout with images
 */
export default function decorate(block) {
  const rows = [...block.children];

  // If already structured as cards, just enhance
  const existingCards = block.querySelectorAll('.recipe-card');
  if (existingCards.length > 0) {
    block.classList.add('recipe-cards-grid');

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

      return;
    }
  }

  // Fallback: try to build from rows
  const cards = [];

  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length === 0) return;

    const card = document.createElement('div');
    card.className = 'recipe-card';

    // First cell might be image
    const firstCell = cells[0];
    const img = firstCell?.querySelector('img, picture');

    if (img) {
      const imageDiv = document.createElement('div');
      imageDiv.className = 'recipe-card-image';
      const imgEl = img.tagName === 'PICTURE' ? img.querySelector('img') : img;
      if (imgEl) {
        imgEl.loading = 'lazy';
        imageDiv.appendChild(imgEl.cloneNode(true));
      }
      card.appendChild(imageDiv);
      cells.shift();
    }

    // Content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'recipe-card-content';

    cells.forEach((cell, i) => {
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
    });

    if (contentDiv.children.length > 0) {
      card.appendChild(contentDiv);
      cards.push(card);
    }
  });

  if (cards.length > 0) {
    block.innerHTML = '';
    block.classList.add('recipe-cards-grid');
    cards.forEach((card) => block.appendChild(card));
  }
}
