# Vitamix POC - AEM Edge Delivery Services

An AI-powered content generation platform built on AEM Edge Delivery Services (aem.live) that creates personalized product pages, recipes, and support content based on user queries.

## Quick Start
- `npm i` - Install dependencies
- `aem up` - Start local dev server at http://localhost:3000
- `npm run lint` - Run ESLint

## Architecture Overview

### Core Flow
```
User Query → Worker API (SSE) → Block Streaming → Page Decoration → DA Persistence
```

### Key Directories
- `/blocks/` - 72 custom blocks (see Block Categories below)
- `/scripts/` - Core decoration, utilities, analytics
- `/styles/` - Global CSS
- `/workers/` - Cloudflare Workers (recommender, analytics, embeddings)
- `/.claude/skills/` - Claude Code skills for development workflows

### Cloudflare Workers
| Worker | URL | Purpose |
|--------|-----|---------|
| vitamix-recommender | `vitamix-recommender.paolo-moz.workers.dev` | Main AI generation (Claude + Cerebras) |
| vitamix-analytics | `vitamix-analytics.paolo-moz.workers.dev` | Tracking & multi-agent analysis |
| embed-recipes | (internal) | Recipe vector embeddings |

## Key Files

### Entry Points
- `scripts/scripts.js` - Main orchestrator, handles generation modes
- `scripts/aem.js` - Standard EDS utilities (decoration, block loading)
- `scripts/delayed.js` - Analytics setup (loads after page)

### Utilities
- `scripts/session-context.js` - Query history in sessionStorage (max 10)
- `scripts/analytics-tracker.js` - Event tracking (respects DNT)
- `scripts/cta-utils.js` - Link classification, purchase-intent sanitization

## Block Categories (72 total)

### AI/Search (Core)
`query-form`, `cerebras-generated`, `ingredient-search`, `quick-answer`, `reasoning`, `support-triage`

### Products
`product-cards`, `product-recommendation`, `product-hero`, `product-compare`, `product-cta`, `product-info`

### Recipes
`recipe-cards`, `recipe-hero`, `recipe-steps`, `recipe-tabs`, `recipe-filter-bar`, `recipe-grid`

### Analytics
`analytics-queries`, `analytics-last-queries`, `analytics-analysis`, `analytics-metrics`, `analytics-dashboard`

### Layout/Content
`hero`, `cards`, `columns`, `split-content`, `fragment`, `header`, `footer`, `faq`, `testimonials`

### Specialized
`accessibility-specs`, `budget-breakdown`, `engineering-specs`, `sustainability-info`, `allergen-safety`, `smart-features`

## Generation Modes

| Mode | URL Param | Worker | Features |
|------|-----------|--------|----------|
| Recommender | `?q=` or `?query=` | vitamix-recommender | Session context, auto-persist, journey tracking |
| Fast | `?fast=` | vitamix-generative-fast | Two-phase (hero first), manual save |
| Standard | `?generate=` | vitamix-generative | Full streaming, progress indicators |
| Experiment | `?experiment=` | N/A | Fade-in animations, POC |

## AI Model Configuration

### Presets (in vitamix-recommender)
- **production**: Claude Opus (reasoning) + Cerebras (content)
- **fast**: Claude Sonnet (reasoning) + Cerebras (content)
- **all-cerebras**: Pure Cerebras stack (cost-optimized)

### Services Used
- **Anthropic**: Intent analysis, block selection reasoning
- **Cerebras**: Content generation, classification
- **OpenAI/Gemini**: Multi-agent analysis consensus (analytics)
- **Cloudflare Vectorize**: Recipe semantic search

## Environment Variables (.env)
```
ANTHROPIC_API_KEY=sk-ant-...
CEREBRAS_API_KEY=csk-...
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=AIza...
DA_IMS_TOKEN=eyJ... (Adobe IMS JWT)
FAL_API_KEY=... (optional, video generation)
```

## Conventions

### Code Style
- ESM modules (no CommonJS)
- kebab-case for CSS classes, camelCase for JS properties
- JSDoc for complex functions
- `[ModuleName]` prefix for console logging

### Block Structure
```
blocks/{block-name}/
  ├── {block-name}.js   # export default function decorate(block) {...}
  └── {block-name}.css
```

### Block JS Pattern
```javascript
export default function decorate(block) {
  const rows = [...block.children];
  // Transform DA table to presentational HTML
  block.innerHTML = '<div class="block-content">...</div>';
}
```

### Image Handling
- `data-gen-image="{id}"` for AI-generated images
- `data-original-src` stores original URL during generation
- Cache-busting: `url + '?_t=' + Date.now()`
- Use `createOptimizedPicture()` for authored images (skip for generated)

### CTA Sanitization
Purchase-intent language is auto-converted:
- "Buy Now" → "Learn More"
- "Add to Cart" → "View Details"
- "Purchase" → "Explore"

## Development Workflow

**IMPORTANT**: For ALL block development, start with the `content-driven-development` skill:
```
Using Skill: content-driven-development
```

### Available Skills (in /.claude/skills/)
- `content-driven-development` - Main development workflow
- `building-blocks` - Create/modify blocks
- `content-modeling` - Design block content models
- `block-inventory` - Survey available blocks
- `block-collection-and-party` - Reference implementations
- `testing-blocks` - Test code changes
- `page-import` - Import external pages

## Testing
- `/test-blocks/` - Visual test pages
- `/test-results/` - Test result reports
- Blocks support both authored (DA table) and AI-generated content

## Key Patterns

### SSE Streaming
```javascript
const eventSource = new EventSource(url);
eventSource.addEventListener('block-content', (e) => {
  const { html, sectionStyle, imageId } = JSON.parse(e.data);
  // Render block progressively
});
eventSource.addEventListener('image-ready', (e) => {
  const { imageId, url } = JSON.parse(e.data);
  // Replace placeholder image
});
```

### Session Context
```javascript
import { SessionContextManager } from './session-context.js';
const ctx = SessionContextManager.buildEncodedContextParam();
// Sends previous queries to worker for conversational flow
```

### Analytics Events
- `session_start` - New session
- `query` - User search
- `page_published` - Generated page saved
- `conversion` - CTA click to vitamix.com
