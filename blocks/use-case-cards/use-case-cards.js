/**
 * Use Case Cards Block
 * Displays use cases in a grid layout
 */
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
    cards.forEach((card) => block.appendChild(card));
  }
}
