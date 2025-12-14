/**
 * Analytics Metrics Block
 *
 * Displays key analytics metrics in a card grid.
 */

const ANALYTICS_ENDPOINT = 'https://vitamix-analytics.paolo-moz.workers.dev';

/**
 * Format a number with commas
 */
function formatNumber(num) {
  return num?.toLocaleString() || '0';
}

/**
 * Format a percentage
 */
function formatPercent(num) {
  return `${(num || 0).toFixed(1)}%`;
}

/**
 * Create a metric card element
 */
function createMetricCard(label, value, subtitle = '') {
  const card = document.createElement('div');
  card.className = 'metric-card';
  card.innerHTML = `
    <div class="metric-value">${value}</div>
    <div class="metric-label">${label}</div>
    ${subtitle ? `<div class="metric-subtitle">${subtitle}</div>` : ''}
  `;
  return card;
}

/**
 * Load and display metrics
 */
async function loadMetrics(block) {
  const metricsContainer = block.querySelector('.metrics-grid');

  try {
    const response = await fetch(`${ANALYTICS_ENDPOINT}/api/analytics/summary`);
    if (!response.ok) throw new Error('Failed to load summary');

    const data = await response.json();

    metricsContainer.innerHTML = '';
    metricsContainer.appendChild(createMetricCard('Total Sessions', formatNumber(data.totalSessions), 'Last 30 days'));
    metricsContainer.appendChild(createMetricCard('Total Queries', formatNumber(data.totalQueries)));
    metricsContainer.appendChild(createMetricCard('Avg Queries/Session', data.avgQueriesPerSession?.toFixed(1) || '0', 'Content usefulness'));
    metricsContainer.appendChild(createMetricCard('Conversion Rate', formatPercent(data.conversionRate), 'Clicks to vitamix.com'));
    metricsContainer.appendChild(createMetricCard('Engagement Rate', formatPercent(data.engagementRate), 'Sessions with 2+ queries'));
    metricsContainer.appendChild(createMetricCard('Total Conversions', formatNumber(data.totalConversions)));
  } catch (error) {
    console.error('[Analytics] Failed to load metrics:', error);
    metricsContainer.innerHTML = `
      <div class="error-message">
        <p>Failed to load analytics data.</p>
      </div>
    `;
  }
}

/**
 * Main block decoration function
 */
export default async function decorate(block) {
  block.innerHTML = `
    <h3>Key Metrics</h3>
    <div class="metrics-grid">
      <div class="loading">Loading metrics...</div>
    </div>
  `;

  await loadMetrics(block);

  // Auto-refresh every 60 seconds
  setInterval(() => loadMetrics(block), 60000);
}
