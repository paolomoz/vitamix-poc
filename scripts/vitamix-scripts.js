/**
 * Vitamix Recommender - Frontend Scripts
 *
 * Handles SSE streaming from the vitamix-recommender worker with:
 * - Reasoning block streaming (shows AI thought process)
 * - Dynamic block assembly
 * - Session context for contextual browsing
 * - Progressive loading with skeleton states
 */

import {
  decorateBlock,
  loadBlock,
  decorateButtons,
  decorateIcons,
  loadCSS,
} from './aem.js';
import { SessionContextManager } from './session-context.js';

// Vitamix recommender worker URL
const VITAMIX_WORKER_URL = 'https://vitamix-recommender.paolo-moz.workers.dev';

// Store original block data for publishing
let originalBlocksData = [];

// Store published page URL
let publishedPageUrl = null;

function generateSlug(query) {
  let slug = query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
  const hash = simpleHash(query + Date.now()).slice(0, 6);
  return slug + '-' + hash;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }
  return Math.abs(hash).toString(36);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^$`{}()|[\]\\]/g, '\\$&');
}

function isGenerationRequest() {
  const params = new URLSearchParams(window.location.search);
  return params.has('q') || params.has('query');
}

function createSkeletonBlock(blockType) {
  const section = document.createElement('div');
  section.className = 'section skeleton-section';
  section.dataset.blockType = blockType;
  
  const skeletonHTML = {
    reasoning: '<div class="reasoning skeleton"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:80%"></div></div>',
    hero: '<div class="hero skeleton"><div class="skeleton-image"></div><div class="skeleton-line" style="width:70%"></div></div>',
    default: '<div class="block skeleton"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:90%"></div></div>'
  };
  
  section.innerHTML = skeletonHTML[blockType] || skeletonHTML.default;
  return section;
}

function showSkeletonState(container, expectedBlocks) {
  (expectedBlocks || ['reasoning', 'hero']).forEach(function(blockType) {
    container.appendChild(createSkeletonBlock(blockType));
  });
}

function removeSkeletonForBlock(container, blockType) {
  const skeleton = container.querySelector('.skeleton-section[data-block-type="' + blockType + '"]');
  if (skeleton) skeleton.remove();
}

async function renderBlockSection(blockData, container) {
  const blockType = blockData.blockName || blockData.type || 'default';
  removeSkeletonForBlock(container, blockType);

  const section = document.createElement('div');
  section.className = 'section';
  if (blockData.sectionStyle && blockData.sectionStyle !== 'default') {
    section.classList.add(blockData.sectionStyle);
  }
  section.dataset.sectionStatus = 'initialized';
  section.innerHTML = blockData.html;

  section.querySelectorAll('img[data-gen-image]').forEach(function(img) {
    img.dataset.originalSrc = img.getAttribute('src');
    img.onload = function() { img.classList.add('loaded'); };
    if (img.complete && img.naturalWidth > 0) img.classList.add('loaded');
  });

  const blockEl = section.querySelector('[class]');
  if (blockEl) {
    const blockName = blockEl.classList[0];
    const wrapper = document.createElement('div');
    wrapper.className = blockName + '-wrapper';
    blockEl.parentNode.insertBefore(wrapper, blockEl);
    wrapper.appendChild(blockEl);
    decorateBlock(blockEl);
    section.classList.add(blockName + '-container');
  }

  decorateButtons(section);
  decorateIcons(section);
  container.appendChild(section);

  const block = section.querySelector('.block');
  if (block) await loadBlock(block);

  section.dataset.sectionStatus = 'loaded';
  return section;
}

function getStepIcon(step) {
  const icons = {
    understanding: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    analysis: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>',
    recommendation: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
  };
  return icons[step] || icons.understanding;
}

function renderReasoningStep(stepData, reasoningContainer) {
  let stepEl = reasoningContainer.querySelector('[data-step="' + stepData.step + '"]');

  if (!stepEl) {
    stepEl = document.createElement('div');
    stepEl.className = 'reasoning-step';
    stepEl.dataset.step = stepData.step;
    stepEl.innerHTML = '<div class="step-indicator"><div class="step-icon">' + getStepIcon(stepData.step) + '</div><div class="step-line"></div></div><div class="step-content"><div class="step-title">' + stepData.title + '</div><div class="step-text"></div></div>';
    reasoningContainer.appendChild(stepEl);
  }

  const stepText = stepEl.querySelector('.step-text');
  if (stepText) stepText.textContent = stepData.content;
  if (stepData.isComplete) stepEl.classList.add('complete');
}

function createReasoningBlock(container) {
  const section = document.createElement('div');
  section.className = 'section reasoning-container';
  section.innerHTML = '<div class="reasoning-wrapper"><div class="reasoning block" data-block-status="initialized"><div class="reasoning-header"><span class="reasoning-title">How I Approached Your Question</span><span class="reasoning-badge">AI Reasoning</span></div><div class="reasoning-steps"></div></div></div>';
  removeSkeletonForBlock(container, 'reasoning');
  container.appendChild(section);
  return section.querySelector('.reasoning-steps');
}

async function renderGenerationPage() {
  const main = document.querySelector('main');
  if (!main) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get('q') || params.get('query');
  if (!query) return;

  const slug = generateSlug(query);
  const startTime = Date.now();

  main.innerHTML = '<div id="generation-content"><div class="generating-container"><span class="generating-query">"' + query + '"</span></div></div>';
  const content = main.querySelector('#generation-content');

  originalBlocksData = [];
  const contextParam = SessionContextManager.buildEncodedContextParam();
  const streamUrl = VITAMIX_WORKER_URL + '/generate?query=' + encodeURIComponent(query) + '&slug=' + encodeURIComponent(slug) + '&ctx=' + contextParam;
  const eventSource = new EventSource(streamUrl);

  console.log('[Vitamix] Starting SSE stream for: ' + query);

  let firstBlockReceived = false;
  let reasoningContainer = null;

  eventSource.addEventListener('reasoning-start', function() {
    const loadingContainer = content.querySelector('.generating-container');
    if (loadingContainer) loadingContainer.classList.add('done');
    reasoningContainer = createReasoningBlock(content);
  });

  eventSource.addEventListener('reasoning-step', function(e) {
    const data = JSON.parse(e.data);
    if (reasoningContainer) renderReasoningStep(data, reasoningContainer);
  });

  eventSource.addEventListener('reasoning-complete', function(e) {
    const data = JSON.parse(e.data);
    if (reasoningContainer) {
      reasoningContainer.parentElement.classList.add('complete');
      if (data.confidence) {
        const confidenceEl = document.createElement('div');
        confidenceEl.className = 'reasoning-confidence';
        confidenceEl.innerHTML = 'Confidence: <span class="confidence-value">' + Math.round(data.confidence * 100) + '%</span>';
        reasoningContainer.appendChild(confidenceEl);
      }
    }
    showSkeletonState(content, data.expectedBlocks || ['hero', 'product-cards']);
  });

  eventSource.addEventListener('block-content', async function(e) {
    if (!firstBlockReceived) {
      firstBlockReceived = true;
      const loadingContainer = content.querySelector('.generating-container');
      if (loadingContainer) loadingContainer.classList.add('done');
    }
    const data = JSON.parse(e.data);
    originalBlocksData.push(data);
    await renderBlockSection(data, content);
  });

  const pendingImages = new Map();

  function applyImageUpdate(imageId, url, cropNeeded) {
    const img = content.querySelector('img[data-gen-image="' + imageId + '"]');
    if (img && url) {
      let resolvedUrl = url;
      if (url.startsWith('/')) resolvedUrl = VITAMIX_WORKER_URL + url;
      const cacheBustUrl = resolvedUrl + (resolvedUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
      img.src = cacheBustUrl;
      if (cropNeeded) img.dataset.crop = 'true';
      img.classList.add('loaded');
      const originalUrl = img.dataset.originalSrc;
      if (originalUrl) {
        originalBlocksData.forEach(function(block) {
          block.html = block.html.replace(new RegExp(escapeRegExp(originalUrl), 'g'), resolvedUrl);
        });
      }
      return true;
    }
    return false;
  }

  const retryInterval = setInterval(function() {
    if (pendingImages.size === 0) return;
    pendingImages.forEach(function(data, imageId) {
      if (applyImageUpdate(imageId, data.url, data.cropNeeded)) {
        console.log('[Vitamix] Image applied (retry): ' + imageId);
        pendingImages.delete(imageId);
      } else if (data.attempts >= 20) {
        console.warn('[Vitamix] Image not found after retries: ' + imageId);
        pendingImages.delete(imageId);
      } else {
        pendingImages.set(imageId, { url: data.url, cropNeeded: data.cropNeeded, attempts: data.attempts + 1 });
      }
    });
  }, 100);

  eventSource.addEventListener('image-ready', function(e) {
    const data = JSON.parse(e.data);
    console.log('[Vitamix] Image ready: ' + data.imageId);
    if (!applyImageUpdate(data.imageId, data.url, data.cropNeeded)) {
      pendingImages.set(data.imageId, { url: data.url, cropNeeded: data.cropNeeded, attempts: 0 });
    }
  });

  eventSource.addEventListener('generation-complete', function(e) {
    eventSource.close();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    setTimeout(function() { clearInterval(retryInterval); }, 2000);
    content.querySelectorAll('.skeleton-section').forEach(function(s) { s.remove(); });
    console.log('[Vitamix] Complete in ' + totalTime + 's');

    let intent = null;
    if (e.data) {
      try { intent = JSON.parse(e.data).intent; } catch(err) {}
    }

    SessionContextManager.addQuery({
      query: query,
      timestamp: Date.now(),
      intent: intent?.intentType || 'general',
      entities: intent?.entities || { products: [], ingredients: [], goals: [] },
      generatedPath: '/discover/' + slug
    });

    const h1 = content.querySelector('h1');
    if (h1) document.title = h1.textContent + ' | Vitamix Recommender';
    enableHeaderSearch();

    // Auto-persist to DA
    if (originalBlocksData.length > 0) {
      persistToDA(query, originalBlocksData, intent);
    }
  });

  eventSource.addEventListener('error', function(e) {
    if (e.data) {
      const data = JSON.parse(e.data);
      main.innerHTML = '<div class="section error-container"><h1>Something went wrong</h1><p style="color:#c00;">' + data.message + '</p><p><a href="/">Try again</a></p></div>';
    }
    eventSource.close();
  });

  eventSource.onerror = function() {
    if (eventSource.readyState === EventSource.CLOSED) {
      console.log('[Vitamix] SSE connection closed');
    }
  };
}

function enableHeaderSearch() {
  const header = document.querySelector('header');
  if (!header) return;
  const input = header.querySelector('input[type="text"], input[type="search"], input:not([type])');
  const btn = header.querySelector('.header-explore-btn, button');
  if (input) input.disabled = false;
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg><span>Explore</span>';
  }
}

/**
 * Persist generated page to DA
 */
async function persistToDA(query, blocks, intent) {
  try {
    console.log('[Vitamix] Persisting page to DA...');

    const response = await fetch(VITAMIX_WORKER_URL + '/api/persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        blocks: blocks,
        intent: intent,
      }),
    });

    const result = await response.json();

    if (result.success && result.urls) {
      publishedPageUrl = result.urls.live;
      console.log('[Vitamix] Page published: ' + publishedPageUrl);

      // Dispatch custom event for header Share button
      window.dispatchEvent(new CustomEvent('page-published', {
        detail: {
          url: publishedPageUrl,
          path: result.path,
        },
      }));

      return result;
    } else {
      console.error('[Vitamix] Persist failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('[Vitamix] Persist error:', error);
    return null;
  }
}

function startGeneration(query) {
  const header = document.querySelector('header');
  const headerBtn = header ? header.querySelector('button') : null;
  const headerInput = header ? header.querySelector('input') : null;

  if (headerBtn) {
    headerBtn.disabled = true;
    headerBtn.innerHTML = '<div class="generating-spinner"></div><span>Generating...</span>';
  }
  if (headerInput) headerInput.disabled = true;

  document.querySelectorAll('.suggestion-chip').forEach(function(chip) {
    chip.disabled = true;
    chip.style.pointerEvents = 'none';
    chip.style.opacity = '0.5';
  });

  console.log('[Vitamix] Starting generation for: "' + query + '"');
  window.location.href = '/?q=' + encodeURIComponent(query);
}

function setupQueryForm() {
  const form = document.getElementById('vitamix-form') || document.getElementById('cerebras-form');
  if (!form) return;
  const input = form.querySelector('input');

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) { input.focus(); return; }
    startGeneration(query);
  });

  document.querySelectorAll('.suggestion-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      startGeneration(chip.dataset.query || chip.textContent);
    });
  });
}

function setupHeaderSearch() {
  document.addEventListener('submit', function(e) {
    const header = e.target.closest('header');
    if (!header) return;
    const input = e.target.querySelector('input');
    if (!input) return;
    const query = input.value.trim();
    if (query) {
      e.preventDefault();
      e.stopImmediatePropagation();
      startGeneration(query);
    }
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    const input = e.target;
    if (!input.matches || !input.matches('input')) return;
    const header = input.closest('header');
    if (!header) return;
    const query = input.value.trim();
    if (query) {
      e.preventDefault();
      e.stopImmediatePropagation();
      startGeneration(query);
    }
  }, true);

  console.log('[Vitamix] Header search attached');
}

function setupFollowUpHandlers() {
  document.addEventListener('click', function(e) {
    const followUpChip = e.target.closest('.follow-up-chip');
    if (followUpChip) {
      e.preventDefault();
      startGeneration(followUpChip.dataset.query || followUpChip.textContent);
      return;
    }

    const exploreLink = e.target.closest('a[data-cta-type="explore"]');
    if (exploreLink) {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const hint = exploreLink.dataset.generationHint;
      if (hint) startGeneration(hint);
    }
  }, true);
}

async function init() {
  document.body.classList.add('appear');
  setupHeaderSearch();
  setupFollowUpHandlers();

  if (isGenerationRequest()) {
    await loadCSS('/styles/vitamix.css');
    await renderGenerationPage();
  } else {
    setupQueryForm();
  }
}

document.addEventListener('load', function(e) {
  if (e.target.tagName === 'IMG' && e.target.dataset.genImage) {
    e.target.classList.add('loaded');
  }
}, true);

window.startVitamixGeneration = startGeneration;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
