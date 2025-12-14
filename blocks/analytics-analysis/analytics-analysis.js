/**
 * Analytics Analysis Block
 *
 * AI-powered content analysis with scores and suggestions.
 */

const ANALYTICS_ENDPOINT = 'https://vitamix-analytics.paolo-moz.workers.dev';

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
 * Load last analysis info
 */
async function loadAnalysisInfo(block) {
  const analysisInfo = block.querySelector('.analysis-info');

  try {
    const response = await fetch(`${ANALYTICS_ENDPOINT}/api/analytics/summary`);
    if (!response.ok) throw new Error('Failed to load summary');

    const data = await response.json();

    if (data.lastAnalysis) {
      analysisInfo.innerHTML = `
        <p>Last analysis: ${formatRelativeTime(data.lastAnalysis.timestamp)}
        (Score: ${data.lastAnalysis.overallScore}/100, ${data.lastAnalysis.pagesAnalyzed} pages)</p>
      `;
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
  const analysisInfo = block.querySelector('.analysis-info');

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
    const analysis = data.analysis;

    // Update analysis info
    analysisInfo.innerHTML = `
      <p>Analysis ${data.cached ? 'from cache' : 'completed'}: ${formatRelativeTime(analysis.timestamp)}
      (${analysis.pagesAnalyzed} pages analyzed)</p>
      ${data.cached ? `<p class="cache-notice">Next analysis available: ${new Date(data.nextAvailable).toLocaleTimeString()}</p>` : ''}
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
