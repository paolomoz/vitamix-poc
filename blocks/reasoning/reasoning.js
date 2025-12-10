/**
 * Reasoning Block
 * Displays the AI's reasoning process to users for transparency
 */
export default function decorate(block) {
  // The block structure from the worker:
  // Row 0: Header title
  // Row 1+: Step rows with [stage, title, content]

  const rows = [...block.children];
  if (rows.length === 0) return;

  // Extract header (first row)
  const headerRow = rows[0];
  const headerTitle = headerRow?.textContent?.trim() || 'How I Approached Your Question';

  // Build reasoning structure
  block.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'reasoning-header';
  header.innerHTML = `
    <h3 class="reasoning-title">${headerTitle}</h3>
    <span class="reasoning-badge">AI Reasoning</span>
  `;
  block.appendChild(header);

  // Steps container
  const stepsContainer = document.createElement('div');
  stepsContainer.className = 'reasoning-steps';

  // Process each step row (skip header)
  rows.slice(1).forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return;

    const stage = cells[0]?.textContent?.trim() || 'analysis';
    const content = cells[1]?.innerHTML || cells[1]?.textContent || '';

    // Check if content has a title (bold text at start)
    let title = stage.charAt(0).toUpperCase() + stage.slice(1);
    let bodyContent = content;

    // Look for title in content (first line or bold)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const firstStrong = tempDiv.querySelector('strong, b');
    if (firstStrong) {
      title = firstStrong.textContent;
      firstStrong.remove();
      bodyContent = tempDiv.innerHTML;
    }

    const step = document.createElement('div');
    step.className = `reasoning-step reasoning-step-${stage}`;
    step.innerHTML = `
      <div class="step-indicator">
        <div class="step-icon">${getStageIcon(stage)}</div>
        <div class="step-line"></div>
      </div>
      <div class="step-content">
        <div class="step-title">${title}</div>
        <div class="step-text">${bodyContent}</div>
      </div>
    `;
    stepsContainer.appendChild(step);
  });

  block.appendChild(stepsContainer);

  // Mark steps as complete with animation
  setTimeout(() => {
    stepsContainer.querySelectorAll('.reasoning-step').forEach((step, i) => {
      setTimeout(() => step.classList.add('complete'), i * 200);
    });
  }, 100);
}

function getStageIcon(stage) {
  const icons = {
    understanding: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
    assessment: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    decision: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    analysis: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    recommendation: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  };
  return icons[stage] || icons.analysis;
}
