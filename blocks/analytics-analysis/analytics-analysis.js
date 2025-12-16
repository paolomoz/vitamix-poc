/**
 * Analytics Analysis Block
 *
 * AI-powered content analysis with scores and suggestions.
 */

const ANALYTICS_ENDPOINT = 'https://vitamix-analytics.paolo-moz.workers.dev';

/**
 * Show a toast notification
 */
function showNotification(message, type = 'success') {
  const existing = document.querySelector('.analytics-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `analytics-notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Generate a Claude Code prompt for an improvement suggestion
 */
async function generatePrompt(suggestion, category, problematicPages) {
  // Build context about affected pages
  const pagesContext = problematicPages && problematicPages.length > 0
    ? `\n\nAffected pages that need this improvement:\n${problematicPages.map((p) => `- ${p.url} (${p.reason})`).join('\n')}`
    : '';

  const categoryContext = {
    content: 'content quality, relevance, and information completeness',
    layout: 'visual hierarchy, formatting, and page structure',
    conversion: 'CTAs, product links, and conversion optimization',
  };

  const prompt = `# Improvement Task: ${category.charAt(0).toUpperCase() + category.slice(1)}

## Issue to Address
${suggestion}

## Category Focus
This improvement focuses on ${categoryContext[category] || category}.
${pagesContext}

## Instructions
1. Analyze the relevant blocks and templates in this AEM Edge Delivery Services project
2. Identify the specific code changes needed to address this improvement
3. Implement the changes following existing code patterns and styles
4. Test the changes locally before committing

## Project Context
- This is a Vitamix product recommendation site built on AEM Edge Delivery Services
- Generated pages are created dynamically based on user queries
- Focus on improving the user experience and conversion rate

Please implement this improvement across the affected components.`;

  return prompt;
}

/**
 * Generate a Claude Code prompt for multiple improvement suggestions
 */
async function generateMultiPrompt(items, problematicPages) {
  const pagesContext = problematicPages && problematicPages.length > 0
    ? `\n\nAffected pages that may need improvements:\n${problematicPages.map((p) => `- ${p.url} (${p.reason})`).join('\n')}`
    : '';

  const categoryContext = {
    content: 'content quality, relevance, and information completeness',
    layout: 'visual hierarchy, formatting, and page structure',
    conversion: 'CTAs, product links, and conversion optimization',
  };

  // Group items by category
  const byCategory = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item.text);
    return acc;
  }, {});

  const improvementsList = Object.entries(byCategory)
    .map(([cat, texts]) => `### ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${categoryContext[cat] || cat})\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`)
    .join('\n\n');

  const prompt = `# Improvement Task: Multiple Improvements (${items.length} total)

## Issues to Address
${improvementsList}
${pagesContext}

## Instructions
1. Analyze the relevant blocks and templates in this AEM Edge Delivery Services project
2. Identify the specific code changes needed to address each improvement
3. Implement the changes following existing code patterns and styles
4. Test the changes locally before committing
5. Address improvements in priority order (they are listed by recommended priority)

## Project Context
- This is a Vitamix product recommendation site built on AEM Edge Delivery Services
- Generated pages are created dynamically based on user queries
- Focus on improving the user experience and conversion rate

Please implement these improvements across the affected components.`;

  return prompt;
}

/**
 * Handle execute button click
 */
async function handleExecuteClick(button, suggestion, category, problematicPages) {
  const originalContent = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>';
  button.classList.add('loading');

  try {
    // Simulate a brief delay for prompt generation
    await new Promise((resolve) => setTimeout(resolve, 500));

    const prompt = await generatePrompt(suggestion, category, problematicPages);

    // Copy to clipboard
    await navigator.clipboard.writeText(prompt);

    // Show success state
    button.innerHTML = '✓';
    button.classList.remove('loading');
    button.classList.add('success');

    showNotification('Prompt copied to clipboard! Paste it in Claude Code.');

    // Reset after delay
    setTimeout(() => {
      button.innerHTML = originalContent;
      button.classList.remove('success');
      button.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('[Analytics] Failed to generate prompt:', error);
    button.innerHTML = '✗';
    button.classList.remove('loading');
    button.classList.add('error');
    showNotification('Failed to copy prompt', 'error');

    setTimeout(() => {
      button.innerHTML = originalContent;
      button.classList.remove('error');
      button.disabled = false;
    }, 2000);
  }
}

/**
 * Normalize a suggestion to ensure it has text, impact, and effort
 * Handles both old format (string) and new format (object with text/impact/effort)
 */
function normalizeSuggestion(suggestion, category) {
  // New format: suggestion is an object with text, impact, effort
  if (typeof suggestion === 'object' && suggestion.text) {
    return {
      text: suggestion.text,
      impact: suggestion.impact || 'medium',
      effort: suggestion.effort || 'medium',
      category,
    };
  }
  // Old format (backwards compatibility): suggestion is a string, use defaults
  return {
    text: String(suggestion),
    impact: 'medium',
    effort: 'medium',
    category,
  };
}

/**
 * Calculate priority score for sorting (higher = do first)
 * Priority matrix: High Impact + Low Effort = best
 */
function calculatePriority(impact, effort) {
  const impactScore = { high: 3, medium: 2, low: 1 };
  const effortScore = { low: 3, medium: 2, high: 1 }; // Inverted: low effort = high score
  return impactScore[impact] * 2 + effortScore[effort]; // Impact weighted more
}

/**
 * Create actionable improvements section
 */
function createActionableImprovements(analysis) {
  const container = document.createElement('div');
  container.className = 'actionable-improvements';

  const allSuggestions = [];

  // Collect all suggestions with their categories (using API-provided impact/effort)
  if (analysis.suggestions?.content) {
    analysis.suggestions.content.forEach((s) => {
      allSuggestions.push(normalizeSuggestion(s, 'content'));
    });
  }
  if (analysis.suggestions?.layout) {
    analysis.suggestions.layout.forEach((s) => {
      allSuggestions.push(normalizeSuggestion(s, 'layout'));
    });
  }
  if (analysis.suggestions?.conversion) {
    analysis.suggestions.conversion.forEach((s) => {
      allSuggestions.push(normalizeSuggestion(s, 'conversion'));
    });
  }

  if (allSuggestions.length === 0) {
    return null;
  }

  // Sort by priority (high impact + low effort first)
  allSuggestions.sort((a, b) => {
    const priorityA = calculatePriority(a.impact, a.effort);
    const priorityB = calculatePriority(b.impact, b.effort);
    return priorityB - priorityA;
  });

  container.innerHTML = '<h4>Actionable Improvements</h4><p class="section-description">Sorted by recommended priority (AI-assessed). Select improvements and click Execute Selected, or execute individually.</p>';

  // Select all controls
  const selectControls = document.createElement('div');
  selectControls.className = 'select-controls';

  const selectAllLabel = document.createElement('label');
  selectAllLabel.className = 'select-all-label';

  const selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.type = 'checkbox';
  selectAllCheckbox.className = 'select-all-checkbox';

  selectAllLabel.appendChild(selectAllCheckbox);
  selectAllLabel.appendChild(document.createTextNode(' Select All'));

  const executeSelectedBtn = document.createElement('button');
  executeSelectedBtn.className = 'execute-selected-btn';
  executeSelectedBtn.textContent = 'Execute Selected';
  executeSelectedBtn.disabled = true;

  selectControls.appendChild(selectAllLabel);
  selectControls.appendChild(executeSelectedBtn);
  container.appendChild(selectControls);

  const list = document.createElement('ul');
  list.className = 'actionable-list';

  // Track checkboxes for select all functionality
  const checkboxes = [];

  allSuggestions.forEach(({
    text, category, impact, effort,
  }, index) => {
    const item = document.createElement('li');
    item.className = 'actionable-item';

    // Checkbox for selection
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'item-checkbox';
    checkbox.dataset.index = index;
    checkbox.dataset.text = text;
    checkbox.dataset.category = category;
    checkboxes.push(checkbox);

    const content = document.createElement('div');
    content.className = 'actionable-content';

    const header = document.createElement('div');
    header.className = 'actionable-header';

    const orderBadge = document.createElement('span');
    orderBadge.className = 'order-badge';
    orderBadge.textContent = `#${index + 1}`;

    const badge = document.createElement('span');
    badge.className = `category-badge ${category}`;
    badge.textContent = category;

    header.appendChild(orderBadge);
    header.appendChild(badge);

    const impactBadge = document.createElement('span');
    impactBadge.className = `metric-badge impact-${impact}`;
    impactBadge.innerHTML = `<span class="metric-label">Impact:</span> ${impact}`;

    const effortBadge = document.createElement('span');
    effortBadge.className = `metric-badge effort-${effort}`;
    effortBadge.innerHTML = `<span class="metric-label">Effort:</span> ${effort}`;

    header.appendChild(impactBadge);
    header.appendChild(effortBadge);

    const textSpan = document.createElement('span');
    textSpan.className = 'actionable-text';
    textSpan.textContent = text;

    content.appendChild(header);
    content.appendChild(textSpan);

    const executeBtn = document.createElement('button');
    executeBtn.className = 'execute-btn';
    executeBtn.innerHTML = 'Execute';
    executeBtn.addEventListener('click', () => handleExecuteClick(executeBtn, text, category, analysis.problematicPages));

    item.appendChild(checkbox);
    item.appendChild(content);
    item.appendChild(executeBtn);
    list.appendChild(item);
  });

  container.appendChild(list);

  // Update execute selected button state based on selections
  const updateExecuteSelectedState = () => {
    const selectedCount = checkboxes.filter((cb) => cb.checked).length;
    executeSelectedBtn.disabled = selectedCount === 0;
    executeSelectedBtn.textContent = selectedCount > 0
      ? `Execute Selected (${selectedCount})`
      : 'Execute Selected';

    // Update select all checkbox state
    if (selectedCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (selectedCount === checkboxes.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  };

  // Add change listeners to all checkboxes
  checkboxes.forEach((cb) => {
    cb.addEventListener('change', updateExecuteSelectedState);
  });

  // Select all functionality
  selectAllCheckbox.addEventListener('change', () => {
    const newState = selectAllCheckbox.checked;
    checkboxes.forEach((cb) => {
      cb.checked = newState;
    });
    updateExecuteSelectedState();
  });

  // Execute selected functionality
  executeSelectedBtn.addEventListener('click', async () => {
    const selectedItems = checkboxes
      .filter((cb) => cb.checked)
      .map((cb) => ({
        text: cb.dataset.text,
        category: cb.dataset.category,
      }));

    if (selectedItems.length === 0) return;

    const originalContent = executeSelectedBtn.textContent;
    executeSelectedBtn.disabled = true;
    executeSelectedBtn.innerHTML = '<span class="spinner"></span>';
    executeSelectedBtn.classList.add('loading');

    try {
      const prompt = await generateMultiPrompt(selectedItems, analysis.problematicPages);
      await navigator.clipboard.writeText(prompt);

      executeSelectedBtn.innerHTML = '✓';
      executeSelectedBtn.classList.remove('loading');
      executeSelectedBtn.classList.add('success');
      showNotification(`Prompt for ${selectedItems.length} improvement(s) copied to clipboard!`);

      setTimeout(() => {
        executeSelectedBtn.textContent = originalContent;
        executeSelectedBtn.classList.remove('success');
        executeSelectedBtn.disabled = false;
        updateExecuteSelectedState();
      }, 2000);
    } catch (error) {
      console.error('[Analytics] Failed to generate prompt:', error);
      executeSelectedBtn.innerHTML = '✗';
      executeSelectedBtn.classList.remove('loading');
      executeSelectedBtn.classList.add('error');
      showNotification('Failed to copy prompt', 'error');

      setTimeout(() => {
        executeSelectedBtn.textContent = originalContent;
        executeSelectedBtn.classList.remove('error');
        executeSelectedBtn.disabled = false;
        updateExecuteSelectedState();
      }, 2000);
    }
  });

  return container;
}

/**
 * Format a timestamp as relative time
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

/**
 * Create a score gauge element
 */
function createScoreGauge(score, label) {
  const gauge = document.createElement('div');
  gauge.className = 'score-gauge';

  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#eab308' : '#ef4444';

  gauge.innerHTML = `
    <div class="gauge-circle" style="--score: ${score}; --color: ${color}">
      <span class="gauge-value">${score}</span>
    </div>
    <div class="gauge-label">${label}</div>
  `;
  return gauge;
}

/**
 * Display analysis results
 */
function displayAnalysisResults(block, analysis, cached = false) {
  const analysisResults = block.querySelector('.analysis-results');
  const analysisInfo = block.querySelector('.analysis-info');

  // Update analysis info
  analysisInfo.innerHTML = `
    <p>Last analysis: ${formatRelativeTime(analysis.timestamp)}
    (Score: ${analysis.overallScore}/100, ${analysis.pagesAnalyzed} pages)</p>
  `;

  // Build results
  analysisResults.innerHTML = '';

  // Scores section
  const scoresSection = document.createElement('div');
  scoresSection.className = 'scores-section';
  scoresSection.appendChild(createScoreGauge(analysis.overallScore, 'Overall'));
  scoresSection.appendChild(createScoreGauge(analysis.contentScore, 'Content'));
  scoresSection.appendChild(createScoreGauge(analysis.layoutScore, 'Layout'));
  scoresSection.appendChild(createScoreGauge(analysis.conversionScore, 'Conversion'));
  analysisResults.appendChild(scoresSection);

  // Top issues
  if (analysis.topIssues && analysis.topIssues.length > 0) {
    const issuesSection = document.createElement('div');
    issuesSection.className = 'issues-section';
    issuesSection.innerHTML = `
      <h4>Top Issues</h4>
      <ul class="issues-list">
        ${analysis.topIssues.map((issue) => `<li>${issue}</li>`).join('')}
      </ul>
    `;
    analysisResults.appendChild(issuesSection);
  }

  // Actionable improvements section
  const actionableSection = createActionableImprovements(analysis);
  if (actionableSection) {
    analysisResults.appendChild(actionableSection);
  }
}

/**
 * Load last analysis info and display results if available
 */
async function loadAnalysisInfo(block) {
  const analysisInfo = block.querySelector('.analysis-info');

  try {
    const response = await fetch(`${ANALYTICS_ENDPOINT}/api/analytics/summary`);
    if (!response.ok) throw new Error('Failed to load summary');

    const data = await response.json();

    if (data.lastAnalysis && data.lastAnalysis.overallScore !== undefined) {
      // Display full analysis results
      displayAnalysisResults(block, data.lastAnalysis, true);
    } else {
      analysisInfo.innerHTML = '<p>No analysis run yet</p>';
    }
  } catch (error) {
    console.error('[Analytics] Failed to load analysis info:', error);
  }
}

/**
 * Run AI analysis
 * @param {HTMLElement} block - The block element
 * @param {boolean} force - If true, bypass rate limiting (dev mode)
 */
async function runAnalysis(block, force = false) {
  const analysisButton = block.querySelector('.run-analysis-btn');
  const analysisResults = block.querySelector('.analysis-results');

  analysisButton.disabled = true;
  analysisButton.textContent = force ? 'Analyzing (forced)...' : 'Analyzing...';
  analysisResults.innerHTML = '<div class="loading">Running AI analysis on recent pages... This may take 30-60 seconds.</div>';

  try {
    const url = force
      ? `${ANALYTICS_ENDPOINT}/api/analytics/analyze?force=true`
      : `${ANALYTICS_ENDPOINT}/api/analytics/analyze`;
    const response = await fetch(url, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Analysis failed');
    }

    const data = await response.json();

    // Show feedback based on whether result was cached or fresh
    if (data.cached) {
      const nextAvailable = data.nextAvailable ? new Date(data.nextAvailable) : null;
      const waitTime = nextAvailable ? Math.ceil((nextAvailable - Date.now()) / 60000) : 60;
      showNotification(`Returning cached result. New analysis available in ${waitTime} minutes.`, 'warning');
    } else {
      showNotification('Analysis completed successfully!', 'success');
    }

    displayAnalysisResults(block, data.analysis, data.cached);
  } catch (error) {
    console.error('[Analytics] Analysis failed:', error);
    analysisResults.innerHTML = `
      <div class="error-message">
        <p>Analysis failed: ${error.message}</p>
        <p>Make sure the ANTHROPIC_API_KEY is configured in the worker.</p>
      </div>
    `;
  } finally {
    analysisButton.disabled = false;
    analysisButton.textContent = 'Run Analysis';
  }
}

/**
 * Main block decoration function
 */
export default async function decorate(block) {
  block.innerHTML = `
    <h3>AI Content Analysis</h3>
    <div class="analysis-info">
      <p>Loading...</p>
    </div>
    <button class="run-analysis-btn">Run Analysis</button>
    <p class="analysis-note">Analyzes up to 100 recent queries and their generated pages. Available once per hour.</p>
    <div class="analysis-results"></div>
  `;

  await loadAnalysisInfo(block);

  const analysisButton = block.querySelector('.run-analysis-btn');
  // Shift+click to force a new analysis (bypass rate limit for dev)
  analysisButton.addEventListener('click', (e) => runAnalysis(block, e.shiftKey));
  analysisButton.title = 'Shift+click to force new analysis (bypass rate limit)';
}
