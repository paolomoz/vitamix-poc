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
 * Create actionable improvements section
 */
function createActionableImprovements(analysis) {
  const container = document.createElement('div');
  container.className = 'actionable-improvements';

  const allSuggestions = [];

  // Collect all suggestions with their categories
  if (analysis.suggestions?.content) {
    analysis.suggestions.content.forEach((s) => allSuggestions.push({ text: s, category: 'content' }));
  }
  if (analysis.suggestions?.layout) {
    analysis.suggestions.layout.forEach((s) => allSuggestions.push({ text: s, category: 'layout' }));
  }
  if (analysis.suggestions?.conversion) {
    analysis.suggestions.conversion.forEach((s) => allSuggestions.push({ text: s, category: 'conversion' }));
  }

  if (allSuggestions.length === 0) {
    return null;
  }

  container.innerHTML = '<h4>Actionable Improvements</h4><p class="section-description">Click Execute to generate a Claude Code prompt for each improvement</p>';

  const list = document.createElement('ul');
  list.className = 'actionable-list';

  allSuggestions.forEach(({ text, category }) => {
    const item = document.createElement('li');
    item.className = 'actionable-item';

    const content = document.createElement('div');
    content.className = 'actionable-content';

    const badge = document.createElement('span');
    badge.className = `category-badge ${category}`;
    badge.textContent = category;

    const textSpan = document.createElement('span');
    textSpan.className = 'actionable-text';
    textSpan.textContent = text;

    content.appendChild(badge);
    content.appendChild(textSpan);

    const executeBtn = document.createElement('button');
    executeBtn.className = 'execute-btn';
    executeBtn.innerHTML = 'Execute';
    executeBtn.addEventListener('click', () => handleExecuteClick(executeBtn, text, category, analysis.problematicPages));

    item.appendChild(content);
    item.appendChild(executeBtn);
    list.appendChild(item);
  });

  container.appendChild(list);
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
 * Create pages list (exemplary or problematic)
 */
function createPagesList(title, pages, className) {
  const container = document.createElement('div');
  container.className = `pages-section ${className}`;
  container.innerHTML = `
    <h4>${title}</h4>
    <ul class="pages-list">
      ${pages.map((p) => `
        <li>
          <a href="${p.url}" target="_blank">${p.query}</a>
          <span class="page-reason">${p.reason}</span>
        </li>
      `).join('')}
    </ul>
  `;
  return container;
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

  // Suggestions tabs
  const suggestionsSection = document.createElement('div');
  suggestionsSection.className = 'suggestions-container';
  suggestionsSection.innerHTML = '<h4>Improvement Suggestions</h4>';

  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'suggestions-tabs';

  const tabs = [
    { id: 'content', label: 'Content', suggestions: analysis.suggestions?.content || [] },
    { id: 'layout', label: 'Layout', suggestions: analysis.suggestions?.layout || [] },
    { id: 'conversion', label: 'Conversion', suggestions: analysis.suggestions?.conversion || [] },
  ];

  tabs.forEach((tab, index) => {
    const tabButton = document.createElement('button');
    tabButton.className = `tab-button ${index === 0 ? 'active' : ''}`;
    tabButton.textContent = tab.label;
    tabButton.dataset.tab = tab.id;
    tabsContainer.appendChild(tabButton);
  });

  suggestionsSection.appendChild(tabsContainer);

  const tabContent = document.createElement('div');
  tabContent.className = 'tab-content';
  tabs.forEach((tab, index) => {
    const panel = document.createElement('div');
    panel.className = `tab-panel ${index === 0 ? 'active' : ''}`;
    panel.dataset.tab = tab.id;
    if (tab.suggestions.length > 0) {
      panel.innerHTML = `<ul>${tab.suggestions.map((s) => `<li>${s}</li>`).join('')}</ul>`;
    } else {
      panel.innerHTML = '<p class="no-data">No suggestions in this category</p>';
    }
    tabContent.appendChild(panel);
  });
  suggestionsSection.appendChild(tabContent);

  // Tab click handlers
  tabsContainer.querySelectorAll('.tab-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      tabsContainer.querySelectorAll('.tab-button').forEach((b) => b.classList.remove('active'));
      tabContent.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      tabContent.querySelector(`.tab-panel[data-tab="${btn.dataset.tab}"]`).classList.add('active');
    });
  });

  analysisResults.appendChild(suggestionsSection);

  // Pages lists
  const pagesContainer = document.createElement('div');
  pagesContainer.className = 'pages-container';

  if (analysis.exemplaryPages && analysis.exemplaryPages.length > 0) {
    pagesContainer.appendChild(createPagesList('Exemplary Pages', analysis.exemplaryPages, 'exemplary'));
  }

  if (analysis.problematicPages && analysis.problematicPages.length > 0) {
    pagesContainer.appendChild(createPagesList('Pages Needing Improvement', analysis.problematicPages, 'problematic'));
  }

  if (pagesContainer.children.length > 0) {
    analysisResults.appendChild(pagesContainer);
  }

  // Actionable improvements section at the bottom
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
 */
async function runAnalysis(block) {
  const analysisButton = block.querySelector('.run-analysis-btn');
  const analysisResults = block.querySelector('.analysis-results');

  analysisButton.disabled = true;
  analysisButton.textContent = 'Analyzing...';
  analysisResults.innerHTML = '<div class="loading">Running AI analysis on recent pages... This may take 30-60 seconds.</div>';

  try {
    const response = await fetch(`${ANALYTICS_ENDPOINT}/api/analytics/analyze`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Analysis failed');
    }

    const data = await response.json();
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
  analysisButton.addEventListener('click', () => runAnalysis(block));
}
