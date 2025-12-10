/**
 * Quick Answer Block
 * Simple, direct answer for questions that can be answered quickly.
 * Displays at the top with optional expandable "Tell me more" section.
 */

export default function decorate(block) {
  // Expected structure from AI:
  // Row 1: Headline (short, direct answer)
  // Row 2: Brief explanation
  // Row 3 (optional): Expanded details for "Tell me more"

  const rows = [...block.children];
  if (rows.length < 2) {
    console.warn('quick-answer: Expected at least 2 rows');
    return;
  }

  const headline = rows[0]?.textContent?.trim() || 'Here\'s your answer.';
  const explanation = rows[1]?.textContent?.trim() || '';
  const expandedDetails = rows[2]?.textContent?.trim() || '';

  // Clear the block
  block.innerHTML = '';

  // Create card container
  const card = document.createElement('div');
  card.className = 'quick-answer-card';

  // Icon
  const icon = document.createElement('div');
  icon.className = 'quick-answer-icon';
  icon.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  `;
  card.appendChild(icon);

  // Badge
  const badge = document.createElement('span');
  badge.className = 'quick-answer-badge';
  badge.textContent = 'QUICK ANSWER';
  card.appendChild(badge);

  // Headline
  const headlineEl = document.createElement('h2');
  headlineEl.className = 'quick-answer-headline';
  headlineEl.textContent = headline;
  card.appendChild(headlineEl);

  // Explanation
  if (explanation) {
    const explanationEl = document.createElement('p');
    explanationEl.className = 'quick-answer-explanation';
    explanationEl.textContent = explanation;
    card.appendChild(explanationEl);
  }

  // Expandable "Tell me more" section
  if (expandedDetails) {
    const expander = document.createElement('div');
    expander.className = 'quick-answer-expander';

    const toggle = document.createElement('button');
    toggle.className = 'quick-answer-toggle';
    toggle.innerHTML = `
      <span class="toggle-text">TELL ME MORE</span>
      <span class="toggle-icon">↑</span>
    `;

    const content = document.createElement('div');
    content.className = 'quick-answer-details';
    content.textContent = expandedDetails;

    toggle.addEventListener('click', () => {
      const isExpanded = expander.classList.toggle('expanded');
      toggle.querySelector('.toggle-text').textContent = isExpanded ? 'SHOW LESS' : 'TELL ME MORE';
      toggle.querySelector('.toggle-icon').textContent = isExpanded ? '↓' : '↑';
    });

    expander.appendChild(toggle);
    expander.appendChild(content);
    card.appendChild(expander);
  }

  block.appendChild(card);
}
