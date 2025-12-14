/**
 * Analytics Queries Block
 *
 * Displays the top queries from analytics data.
 */

const ANALYTICS_ENDPOINT = 'https://vitamix-analytics.paolo-moz.workers.dev';

/**
 * Load and display top queries
 */
async function loadQueries(block) {
  const container = block.querySelector('.queries-container');

  try {
    const response = await fetch(`${ANALYTICS_ENDPOINT}/api/analytics/summary`);
    if (!response.ok) throw new Error('Failed to load summary');

    const data = await response.json();

    if (data.topQueries && data.topQueries.length > 0) {
      container.innerHTML = `
        <ol class="top-queries-list">
          ${data.topQueries.map((q) => `
            <li>
              <span class="query-text">${q.query}</span>
              <span class="query-count">(${q.count})</span>
            </li>
          `).join('')}
        </ol>
      `;
    } else {
      container.innerHTML = '<p class="no-data">No queries yet</p>';
    }
  } catch (error) {
    console.error('[Analytics] Failed to load queries:', error);
    container.innerHTML = `
      <div class="error-message">
        <p>Failed to load query data.</p>
      </div>
    `;
  }
}

/**
 * Main block decoration function
 */
export default async function decorate(block) {
  block.innerHTML = `
    <h3>Top Queries</h3>
    <div class="queries-container">
      <div class="loading">Loading queries...</div>
    </div>
  `;

  await loadQueries(block);

  // Auto-refresh every 60 seconds
  setInterval(() => loadQueries(block), 60000);
}
