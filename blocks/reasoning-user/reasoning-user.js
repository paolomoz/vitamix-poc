/**
 * Reasoning User Block
 * Displays empathetic, user-focused insights that demonstrate understanding
 * and show how content is tailored to their specific needs
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length === 0) return;

  // Extract header (first row)
  const headerRow = rows[0];
  const headerTitle = headerRow?.textContent?.trim() || 'Here\'s What I Understand';

  // Build reasoning structure
  block.innerHTML = '';

  // Header - more personal and inviting
  const header = document.createElement('div');
  header.className = 'reasoning-user-header';
  header.innerHTML = `
    <h3 class="reasoning-user-title">${headerTitle}</h3>
    <span class="reasoning-user-badge">Personalized for You</span>
  `;
  block.appendChild(header);

  // Intro text for empathy
  const intro = document.createElement('p');
  intro.className = 'reasoning-user-intro';
  intro.textContent = 'I\'ve analyzed your question to give you the most relevant recommendations.';
  block.appendChild(intro);

  // Steps container
  const stepsContainer = document.createElement('div');
  stepsContainer.className = 'reasoning-user-steps';

  // Process each step row (skip header)
  rows.slice(1).forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return;

    const stage = cells[0]?.textContent?.trim() || 'insight';
    const content = cells[1]?.innerHTML || cells[1]?.textContent || '';

    // Get user-friendly title based on stage
    const title = getUserFriendlyTitle(stage);

    // Clean content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const firstStrong = tempDiv.querySelector('strong, b, h4');
    if (firstStrong) {
      firstStrong.remove();
    }
    const bodyContent = tempDiv.innerHTML || tempDiv.textContent;

    const step = document.createElement('div');
    step.className = `reasoning-user-step reasoning-user-step-${stage}`;
    step.innerHTML = `
      <div class="step-emoji">${getStageEmoji(stage)}</div>
      <div class="step-body">
        <div class="step-heading">${title}</div>
        <div class="step-detail">${bodyContent}</div>
      </div>
    `;
    stepsContainer.appendChild(step);
  });

  block.appendChild(stepsContainer);

  // Add a reassuring footer
  const footer = document.createElement('div');
  footer.className = 'reasoning-user-footer';
  footer.innerHTML = `
    <span class="footer-icon">✨</span>
    <span class="footer-text">Everything below is tailored to help you find the perfect solution.</span>
  `;
  block.appendChild(footer);
}

function getUserFriendlyTitle(stage) {
  const titles = {
    understanding: 'I Hear You',
    assessment: 'What Matters',
    decision: 'My Plan',
    analysis: 'Quick Insight',
    recommendation: 'My Pick',
    insight: 'Good to Know',
  };
  return titles[stage] || 'Here\'s What I Found';
}

function getStageEmoji(stage) {
  const emojis = {
    understanding: '💭',
    assessment: '🎯',
    decision: '💡',
    analysis: '🔍',
    recommendation: '⭐',
    insight: '✨',
  };
  return emojis[stage] || '💬';
}
