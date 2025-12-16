/**
 * Vitamix Analytics Worker
 *
 * Handles analytics tracking, aggregation, and AI-powered analysis.
 */

interface Env {
  ANALYTICS: KVNamespace;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  DEBUG?: string;
}

interface TrackingEvent {
  sessionId: string;
  timestamp: number;
  eventType: 'session_start' | 'query' | 'page_published' | 'conversion';
  data: {
    query?: string;
    intent?: string;
    journeyStage?: string;
    consecutiveQueryNumber?: number;
    generatedPageUrl?: string;
    generatedPagePath?: string;
    ctaUrl?: string;
    ctaText?: string;
    sourceQuery?: string;
    queryCountAtConversion?: number;
    referrer?: string;
    userAgent?: string;
    url?: string;
  };
}

interface SessionData {
  sessionId: string;
  startTime: number;
  lastUpdated: number;
  queryCount: number;
  converted: boolean;
  conversionUrl?: string;
  queries: {
    query: string;
    intent?: string;
    journeyStage?: string;
    timestamp: number;
    generatedPageUrl?: string;
    generatedPagePath?: string;
  }[];
  referrer?: string;
}

interface DailyStats {
  date: string;
  sessions: number;
  queries: number;
  conversions: number;
  sessionIds: string[];
}

interface Suggestion {
  text: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
}

interface AnalysisResult {
  timestamp: number;
  overallScore: number;
  contentScore: number;
  layoutScore: number;
  conversionScore: number;
  topIssues: string[];
  suggestions: {
    content: Suggestion[];
    layout: Suggestion[];
    conversion: Suggestion[];
  };
  exemplaryPages: { url: string; query: string; reason: string }[];
  problematicPages: { url: string; query: string; reason: string }[];
  pagesAnalyzed: number;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route requests
      if (url.pathname === '/api/track' && request.method === 'POST') {
        return handleTrack(request, env);
      }

      if (url.pathname === '/api/analytics/summary' && request.method === 'GET') {
        return handleSummary(env);
      }

      if (url.pathname === '/api/analytics/sessions' && request.method === 'GET') {
        return handleSessions(env, url);
      }

      if (url.pathname === '/api/analytics/export' && request.method === 'GET') {
        return handleExport(env);
      }

      if (url.pathname === '/api/analytics/analyze' && request.method === 'POST') {
        const force = url.searchParams.get('force') === 'true';
        return handleAnalyze(env, force);
      }

      if (url.pathname === '/api/analytics/queries/recent' && request.method === 'GET') {
        return handleRecentQueries(env, url);
      }

      if (url.pathname === '/api/analytics/analyze-page' && request.method === 'POST') {
        return handleAnalyzePage(request, env);
      }

      // Health check
      if (url.pathname === '/health') {
        return jsonResponse({ status: 'ok', timestamp: Date.now() });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },
};

/**
 * Handle tracking events from the client
 */
async function handleTrack(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { events: TrackingEvent[] };
  const { events } = body;

  if (!events || !Array.isArray(events)) {
    return jsonResponse({ error: 'Invalid events array' }, 400);
  }

  const today = new Date().toISOString().split('T')[0];

  for (const event of events) {
    await processEvent(event, env, today);
  }

  return jsonResponse({ success: true, processed: events.length });
}

/**
 * Process a single tracking event
 */
async function processEvent(event: TrackingEvent, env: Env, today: string): Promise<void> {
  const { sessionId, eventType, timestamp, data } = event;

  // Get or create session
  const sessionKey = `sessions:${sessionId}`;
  let session: SessionData | null = await env.ANALYTICS.get(sessionKey, 'json');

  if (!session) {
    session = {
      sessionId,
      startTime: timestamp,
      lastUpdated: timestamp,
      queryCount: 0,
      converted: false,
      queries: [],
      referrer: data.referrer,
    };
  }

  session.lastUpdated = timestamp;

  // Process event by type
  switch (eventType) {
    case 'session_start':
      // Session already created above
      break;

    case 'query':
      session.queryCount = data.consecutiveQueryNumber || session.queryCount + 1;
      session.queries.push({
        query: data.query || '',
        intent: data.intent,
        journeyStage: data.journeyStage,
        timestamp,
      });
      // Keep only last 20 queries per session
      if (session.queries.length > 20) {
        session.queries = session.queries.slice(-20);
      }
      break;

    case 'page_published':
      // Update the last query with the generated page URL
      if (session.queries.length > 0) {
        const lastQuery = session.queries[session.queries.length - 1];
        lastQuery.generatedPageUrl = data.generatedPageUrl;
        lastQuery.generatedPagePath = data.generatedPagePath;
      }
      break;

    case 'conversion':
      session.converted = true;
      session.conversionUrl = data.ctaUrl;
      break;
  }

  // Save session with 30-day TTL
  await env.ANALYTICS.put(sessionKey, JSON.stringify(session), {
    expirationTtl: 30 * 24 * 60 * 60,
  });

  // Update daily stats
  await updateDailyStats(env, today, sessionId, eventType);
}

/**
 * Update daily aggregate statistics
 */
async function updateDailyStats(
  env: Env,
  date: string,
  sessionId: string,
  eventType: string
): Promise<void> {
  const dailyKey = `daily:${date}`;
  let daily: DailyStats | null = await env.ANALYTICS.get(dailyKey, 'json');

  if (!daily) {
    daily = {
      date,
      sessions: 0,
      queries: 0,
      conversions: 0,
      sessionIds: [],
    };
  }

  // Track unique sessions
  if (!daily.sessionIds.includes(sessionId)) {
    daily.sessionIds.push(sessionId);
    daily.sessions = daily.sessionIds.length;
  }

  // Update counts
  if (eventType === 'query') {
    daily.queries += 1;
  } else if (eventType === 'conversion') {
    daily.conversions += 1;
  }

  // Keep only last 1000 session IDs to avoid value size limits
  if (daily.sessionIds.length > 1000) {
    daily.sessionIds = daily.sessionIds.slice(-1000);
  }

  // Save with 90-day TTL
  await env.ANALYTICS.put(dailyKey, JSON.stringify(daily), {
    expirationTtl: 90 * 24 * 60 * 60,
  });
}

/**
 * Get analytics summary
 */
async function handleSummary(env: Env): Promise<Response> {
  // Get last 30 days of stats
  const days: DailyStats[] = [];
  const now = new Date();

  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dailyKey = `daily:${dateStr}`;
    const daily: DailyStats | null = await env.ANALYTICS.get(dailyKey, 'json');
    if (daily) {
      days.push(daily);
    }
  }

  // Calculate aggregates
  const totalSessions = days.reduce((sum, d) => sum + d.sessions, 0);
  const totalQueries = days.reduce((sum, d) => sum + d.queries, 0);
  const totalConversions = days.reduce((sum, d) => sum + d.conversions, 0);

  const avgQueriesPerSession = totalSessions > 0 ? totalQueries / totalSessions : 0;
  const conversionRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0;

  // Get session details for engagement metrics
  let sessionsWithMultipleQueries = 0;
  let journeyStageBreakdown: Record<string, number> = {
    exploring: 0,
    comparing: 0,
    deciding: 0,
  };

  // Sample recent sessions for detailed metrics (last 100)
  const allSessionIds = days.flatMap((d) => d.sessionIds).slice(0, 100);
  for (const sessionId of allSessionIds) {
    const session: SessionData | null = await env.ANALYTICS.get(`sessions:${sessionId}`, 'json');
    if (session) {
      if (session.queryCount >= 2) {
        sessionsWithMultipleQueries++;
      }
      // Count journey stages from queries
      for (const query of session.queries) {
        if (query.journeyStage && journeyStageBreakdown[query.journeyStage] !== undefined) {
          journeyStageBreakdown[query.journeyStage]++;
        }
      }
    }
  }

  const engagementRate = allSessionIds.length > 0
    ? (sessionsWithMultipleQueries / allSessionIds.length) * 100
    : 0;

  // Get top queries
  const queryFrequency: Record<string, number> = {};
  for (const sessionId of allSessionIds) {
    const session: SessionData | null = await env.ANALYTICS.get(`sessions:${sessionId}`, 'json');
    if (session) {
      for (const q of session.queries) {
        const normalized = q.query.toLowerCase().trim();
        queryFrequency[normalized] = (queryFrequency[normalized] || 0) + 1;
      }
    }
  }

  const topQueries = Object.entries(queryFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({ query, count }));

  // Get last analysis result (return full analysis for persistence)
  const lastAnalysis: AnalysisResult | null = await env.ANALYTICS.get('analysis:latest', 'json');

  return jsonResponse({
    period: '30d',
    totalSessions,
    totalQueries,
    totalConversions,
    avgQueriesPerSession: Number(avgQueriesPerSession.toFixed(2)),
    conversionRate: Number(conversionRate.toFixed(2)),
    engagementRate: Number(engagementRate.toFixed(2)),
    sessionsWithMultipleQueries,
    journeyStageBreakdown,
    topQueries,
    dailyTrend: days.slice(0, 7).reverse(),
    lastAnalysis: lastAnalysis || null,
  });
}

/**
 * Get list of recent sessions
 */
async function handleSessions(env: Env, url: URL): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // Get recent daily stats to find session IDs
  const now = new Date();
  const allSessionIds: string[] = [];

  for (let i = 0; i < 7 && allSessionIds.length < limit + offset; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const daily: DailyStats | null = await env.ANALYTICS.get(`daily:${dateStr}`, 'json');
    if (daily) {
      allSessionIds.push(...daily.sessionIds);
    }
  }

  // Get session details
  const sessions: SessionData[] = [];
  const targetIds = allSessionIds.slice(offset, offset + limit);

  for (const sessionId of targetIds) {
    const session: SessionData | null = await env.ANALYTICS.get(`sessions:${sessionId}`, 'json');
    if (session) {
      sessions.push(session);
    }
  }

  // Sort by lastUpdated descending
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);

  return jsonResponse({
    sessions,
    total: allSessionIds.length,
    limit,
    offset,
  });
}

/**
 * Export all analytics data
 */
async function handleExport(env: Env): Promise<Response> {
  const days: DailyStats[] = [];
  const sessions: SessionData[] = [];
  const now = new Date();

  // Get 30 days of data
  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const daily: DailyStats | null = await env.ANALYTICS.get(`daily:${dateStr}`, 'json');
    if (daily) {
      days.push(daily);
      // Get sessions for this day
      for (const sessionId of daily.sessionIds.slice(0, 50)) {
        const session: SessionData | null = await env.ANALYTICS.get(`sessions:${sessionId}`, 'json');
        if (session) {
          sessions.push(session);
        }
      }
    }
  }

  return jsonResponse({
    exportedAt: new Date().toISOString(),
    dailyStats: days,
    sessions,
  });
}

// =============================================================================
// MULTI-AGENT ANALYSIS FUNCTIONS
// =============================================================================

interface ModelAnalysis {
  model: string;
  success: boolean;
  analysis?: unknown;
  error?: string;
}

/**
 * Call Claude API for analysis
 */
async function callClaude(prompt: string, env: Env, maxTokens = 2048): Promise<ModelAnalysis> {
  if (!env.ANTHROPIC_API_KEY) {
    return { model: 'claude', success: false, error: 'ANTHROPIC_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Claude] API error:', error);
      return { model: 'claude', success: false, error: 'API request failed' };
    }

    const result = await response.json() as { content: { type: string; text: string }[] };
    const text = result.content[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { model: 'claude', success: true, analysis: JSON.parse(jsonMatch[0]) };
    }
    return { model: 'claude', success: false, error: 'No JSON in response' };
  } catch (e) {
    console.error('[Claude] Error:', e);
    return { model: 'claude', success: false, error: (e as Error).message };
  }
}

/**
 * Call Gemini API for analysis
 */
async function callGemini(prompt: string, env: Env): Promise<ModelAnalysis> {
  if (!env.GOOGLE_API_KEY) {
    return { model: 'gemini', success: false, error: 'GOOGLE_API_KEY not configured' };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Gemini] API error:', error);
      return { model: 'gemini', success: false, error: 'API request failed' };
    }

    const result = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { model: 'gemini', success: true, analysis: JSON.parse(jsonMatch[0]) };
    }
    return { model: 'gemini', success: false, error: 'No JSON in response' };
  } catch (e) {
    console.error('[Gemini] Error:', e);
    return { model: 'gemini', success: false, error: (e as Error).message };
  }
}

/**
 * Call OpenAI API for analysis
 */
async function callOpenAI(prompt: string, env: Env): Promise<ModelAnalysis> {
  if (!env.OPENAI_API_KEY) {
    return { model: 'gpt', success: false, error: 'OPENAI_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[OpenAI] API error:', error);
      return { model: 'gpt', success: false, error: 'API request failed' };
    }

    const result = await response.json() as {
      choices?: { message?: { content?: string } }[];
    };
    const text = result.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { model: 'gpt', success: true, analysis: JSON.parse(jsonMatch[0]) };
    }
    return { model: 'gpt', success: false, error: 'No JSON in response' };
  } catch (e) {
    console.error('[OpenAI] Error:', e);
    return { model: 'gpt', success: false, error: (e as Error).message };
  }
}

/**
 * Run multi-agent analysis in parallel (Claude, Gemini, GPT)
 */
async function runMultiAgentAnalysis(
  prompt: string,
  env: Env
): Promise<{ analyses: ModelAnalysis[]; successCount: number }> {
  console.log('[MultiAgent] Starting parallel analysis with 3 models...');

  const results = await Promise.all([
    callClaude(prompt, env),
    callGemini(prompt, env),
    callOpenAI(prompt, env),
  ]);

  const successCount = results.filter((r) => r.success).length;
  console.log(`[MultiAgent] Completed: ${successCount}/3 models succeeded`);

  return { analyses: results, successCount };
}

/**
 * Synthesize multiple analyses into a unified result using Claude
 */
async function synthesizeAnalyses(
  analyses: ModelAnalysis[],
  originalPromptContext: string,
  env: Env
): Promise<{ success: boolean; synthesis?: unknown; error?: string }> {
  if (!env.ANTHROPIC_API_KEY) {
    return { success: false, error: 'ANTHROPIC_API_KEY not configured for synthesis' };
  }

  const successfulAnalyses = analyses.filter((a) => a.success && a.analysis);

  if (successfulAnalyses.length === 0) {
    return { success: false, error: 'No successful analyses to synthesize' };
  }

  // If only one succeeded, return it directly (already synthesized)
  if (successfulAnalyses.length === 1) {
    return { success: true, synthesis: successfulAnalyses[0].analysis };
  }

  // Build synthesis prompt
  const analysesJson = successfulAnalyses
    .map((a, i) => `Analysis ${i + 1}:\n${JSON.stringify(a.analysis, null, 2)}`)
    .join('\n\n');

  const synthesisPrompt = `You are synthesizing ${successfulAnalyses.length} independent AI analyses of the same content into a single unified analysis.

ORIGINAL CONTEXT:
${originalPromptContext}

INDEPENDENT ANALYSES TO SYNTHESIZE:
${analysesJson}

SYNTHESIS INSTRUCTIONS:
1. Create a unified analysis that represents the consensus of all ${successfulAnalyses.length} analyses
2. For scores: Calculate weighted averages, but use your judgment to adjust based on reasoning quality
3. For lists (strengths, improvements, suggestions, issues): Merge and deduplicate items, keeping the most actionable and specific ones
4. For text summaries: Write a new synthesis that captures key insights from all analyses
5. IMPORTANT: Do NOT mention or reference which analysis said what - present as a single unified view
6. Maintain the exact same JSON structure as the input analyses

Return ONLY valid JSON with the synthesized result (no markdown, no code blocks, no explanation).`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: synthesisPrompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Synthesis] API error:', error);
      return { success: false, error: 'Synthesis API request failed' };
    }

    const result = await response.json() as { content: { type: string; text: string }[] };
    const text = result.content[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log('[Synthesis] Successfully synthesized analyses');
      return { success: true, synthesis: JSON.parse(jsonMatch[0]) };
    }
    return { success: false, error: 'No JSON in synthesis response' };
  } catch (e) {
    console.error('[Synthesis] Error:', e);
    return { success: false, error: (e as Error).message };
  }
}

// =============================================================================
// ANALYSIS HANDLERS
// =============================================================================

/**
 * Run AI analysis on recent queries and generated pages
 * @param env - Environment variables
 * @param force - If true, bypass rate limiting (for development)
 */
async function handleAnalyze(env: Env, force = false): Promise<Response> {
  // Check rate limiting - only allow once per hour (unless force=true)
  const lastAnalysis: AnalysisResult | null = await env.ANALYTICS.get('analysis:latest', 'json');
  if (!force && lastAnalysis && Date.now() - lastAnalysis.timestamp < 60 * 60 * 1000) {
    return jsonResponse({
      cached: true,
      analysis: lastAnalysis,
      nextAvailable: new Date(lastAnalysis.timestamp + 60 * 60 * 1000).toISOString(),
    });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  // Collect queries with page URLs
  const queriesWithPages: { query: string; url: string; intent?: string }[] = [];
  const now = new Date();

  for (let i = 0; i < 7 && queriesWithPages.length < 100; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const daily: DailyStats | null = await env.ANALYTICS.get(`daily:${dateStr}`, 'json');

    if (daily) {
      for (const sessionId of daily.sessionIds) {
        if (queriesWithPages.length >= 100) break;

        const session: SessionData | null = await env.ANALYTICS.get(`sessions:${sessionId}`, 'json');
        if (session) {
          for (const q of session.queries) {
            if (q.generatedPageUrl && queriesWithPages.length < 100) {
              queriesWithPages.push({
                query: q.query,
                url: q.generatedPageUrl,
                intent: q.intent,
              });
            }
          }
        }
      }
    }
  }

  if (queriesWithPages.length === 0) {
    return jsonResponse({
      error: 'No pages with URLs found for analysis',
      suggestion: 'Generate some pages first to build up analytics data',
    }, 400);
  }

  // Fetch page content (sample up to 20 pages to stay within limits)
  const sampled = queriesWithPages.slice(0, 20);
  const pageContents: { query: string; url: string; content: string }[] = [];

  for (const item of sampled) {
    try {
      const response = await fetch(item.url, {
        headers: { 'User-Agent': 'Vitamix-Analytics/1.0' },
      });
      if (response.ok) {
        const html = await response.text();
        // Extract main content, strip scripts/styles
        const content = extractMainContent(html);
        pageContents.push({
          query: item.query,
          url: item.url,
          content: content.slice(0, 5000), // Limit content size
        });
      }
    } catch (e) {
      console.error('Failed to fetch page:', item.url, e);
    }
  }

  if (pageContents.length === 0) {
    return jsonResponse({
      error: 'Could not fetch any page content for analysis',
    }, 500);
  }

  // Build analysis prompt
  const pagesDescription = pageContents
    .map((p, i) => `Page ${i + 1}:\nQuery: "${p.query}"\nURL: ${p.url}\nContent:\n${p.content}\n---`)
    .join('\n\n');

  const analysisPrompt = `Analyze these ${pageContents.length} generated pages from a Vitamix AI recommender application.

For each page, you have:
- The user's original query
- The generated page content (HTML stripped to text)

Provide a summary assessment and actionable suggestions for:

A. CONTENT IMPROVEMENTS
- Is the content relevant to the query?
- Are product recommendations appropriate?
- Are recipes/use cases helpful?
- What content gaps exist?

B. LAYOUT IMPROVEMENTS
- Is the information hierarchy clear?
- Are CTAs prominently placed?
- Is the page easy to scan?
- What layout patterns work well/poorly?

C. CONVERSION OPTIMIZATION
- Are links to vitamix.com visible and compelling?
- Do CTAs have clear value propositions?
- Is there a clear path to purchase?
- What friction points exist?

${pagesDescription}

For each suggestion, evaluate:
- IMPACT: How much will this improvement affect user experience/conversions? (low/medium/high)
- EFFORT: How much development work is needed to implement? (low/medium/high)

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{
  "overallScore": <0-100>,
  "contentScore": <0-100>,
  "layoutScore": <0-100>,
  "conversionScore": <0-100>,
  "topIssues": ["issue1", "issue2", "issue3"],
  "suggestions": {
    "content": [
      {"text": "suggestion text", "impact": "low|medium|high", "effort": "low|medium|high"}
    ],
    "layout": [
      {"text": "suggestion text", "impact": "low|medium|high", "effort": "low|medium|high"}
    ],
    "conversion": [
      {"text": "suggestion text", "impact": "low|medium|high", "effort": "low|medium|high"}
    ]
  },
  "exemplaryPages": [{"url": "...", "query": "...", "reason": "..."}],
  "problematicPages": [{"url": "...", "query": "...", "reason": "..."}]
}`;

  // Run multi-agent analysis (Claude, Gemini, GPT in parallel)
  const { analyses, successCount } = await runMultiAgentAnalysis(analysisPrompt, env);

  if (successCount === 0) {
    const errors = analyses.map((a) => `${a.model}: ${a.error}`).join('; ');
    console.error('[Analyze] All models failed:', errors);
    return jsonResponse({ error: 'All AI models failed to analyze' }, 500);
  }

  // Synthesize analyses into unified result
  const promptContext = `Batch analysis of ${pageContents.length} generated pages from Vitamix AI recommender`;
  const synthesisResult = await synthesizeAnalyses(analyses, promptContext, env);

  if (!synthesisResult.success || !synthesisResult.synthesis) {
    console.error('[Analyze] Synthesis failed:', synthesisResult.error);
    return jsonResponse({ error: 'Failed to synthesize analyses' }, 500);
  }

  const analysis = synthesisResult.synthesis as Omit<AnalysisResult, 'timestamp' | 'pagesAnalyzed'>;

  // Store result
  const result: AnalysisResult = {
    ...analysis,
    timestamp: Date.now(),
    pagesAnalyzed: pageContents.length,
  };

  await env.ANALYTICS.put('analysis:latest', JSON.stringify(result), {
    expirationTtl: 7 * 24 * 60 * 60, // 7 days
  });

  return jsonResponse({
    cached: false,
    analysis: result,
    nextAvailable: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
}

/**
 * Get recent queries with generated page URLs and cached analysis
 */
async function handleRecentQueries(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
  const queries: {
    query: string;
    timestamp: number;
    generatedPageUrl?: string;
    generatedPagePath?: string;
    intent?: string;
    journeyStage?: string;
    sessionId: string;
    analysis?: SinglePageAnalysis;
  }[] = [];

  const now = new Date();

  // Look through recent days to find queries
  for (let i = 0; i < 7 && queries.length < limit; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const daily: DailyStats | null = await env.ANALYTICS.get(`daily:${dateStr}`, 'json');

    if (daily) {
      // Reverse to get most recent first
      const sessionIds = [...daily.sessionIds].reverse();
      for (const sessionId of sessionIds) {
        if (queries.length >= limit) break;

        const session: SessionData | null = await env.ANALYTICS.get(`sessions:${sessionId}`, 'json');
        if (session && session.queries.length > 0) {
          // Reverse queries to get most recent first
          const sessionQueries = [...session.queries].reverse();
          for (const q of sessionQueries) {
            if (queries.length >= limit) break;
            queries.push({
              query: q.query,
              timestamp: q.timestamp,
              generatedPageUrl: q.generatedPageUrl,
              generatedPagePath: q.generatedPagePath,
              intent: q.intent,
              journeyStage: q.journeyStage,
              sessionId: session.sessionId,
            });
          }
        }
      }
    }
  }

  // Sort by timestamp descending (most recent first)
  queries.sort((a, b) => b.timestamp - a.timestamp);
  const limitedQueries = queries.slice(0, limit);

  // Fetch cached analysis for queries with page URLs
  for (const q of limitedQueries) {
    if (q.generatedPageUrl) {
      const cacheKey = `page-analysis:${q.generatedPageUrl}`;
      const cached = await env.ANALYTICS.get(cacheKey, 'json') as {
        timestamp: number;
        analysis: SinglePageAnalysis;
      } | null;
      if (cached) {
        q.analysis = cached.analysis;
      }
    }
  }

  return jsonResponse({
    queries: limitedQueries,
    total: queries.length,
  });
}

/**
 * Analyze a single page
 */
async function handleAnalyzePage(request: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const body = await request.json() as { query: string; url: string };
  const { query, url: pageUrl } = body;

  if (!query || !pageUrl) {
    return jsonResponse({ error: 'Missing query or url parameter' }, 400);
  }

  // Check cache first (cache per URL for 1 hour)
  const cacheKey = `page-analysis:${pageUrl}`;
  const cached = await env.ANALYTICS.get(cacheKey, 'json') as {
    timestamp: number;
    analysis: SinglePageAnalysis;
  } | null;

  if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
    return jsonResponse({
      cached: true,
      analysis: cached.analysis,
    });
  }

  // Fetch page content
  let content: string;
  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Vitamix-Analytics/1.0' },
    });
    if (!response.ok) {
      return jsonResponse({ error: `Failed to fetch page: ${response.status}` }, 400);
    }
    const html = await response.text();
    content = extractMainContent(html);
    if (content.length < 100) {
      return jsonResponse({ error: 'Page content too short for analysis' }, 400);
    }
    content = content.slice(0, 8000); // Limit content size
  } catch (e) {
    return jsonResponse({ error: `Failed to fetch page: ${(e as Error).message}` }, 500);
  }

  // Build analysis prompt for single page
  const analysisPrompt = `Analyze this generated page from a Vitamix AI recommender application.

User's Query: "${query}"
Page URL: ${pageUrl}

Page Content:
${content}

Evaluate this page on how well it serves the user's query. Score each category from 0-100:

1. CONTENT RELEVANCE (contentScore)
- Does the content directly address the user's query?
- Are product recommendations appropriate for the query?
- Are recipes/use cases helpful and relevant?
- Is the information accurate and useful?

2. LAYOUT QUALITY (layoutScore)
- Is the information well-organized and easy to scan?
- Is there a clear visual hierarchy?
- Are sections logically structured?

3. CONVERSION OPTIMIZATION (conversionScore)
- Are there clear CTAs to vitamix.com?
- Is there a visible path to learn more or purchase?
- Are product links prominent and compelling?

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{
  "overallScore": <0-100 weighted average>,
  "contentScore": <0-100>,
  "layoutScore": <0-100>,
  "conversionScore": <0-100>,
  "summary": "<2-3 sentence summary of the page quality>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"]
}`;

  // Run multi-agent analysis (Claude, Gemini, GPT in parallel)
  const { analyses, successCount } = await runMultiAgentAnalysis(analysisPrompt, env);

  if (successCount === 0) {
    const errors = analyses.map((a) => `${a.model}: ${a.error}`).join('; ');
    console.error('[AnalyzePage] All models failed:', errors);
    return jsonResponse({ error: 'All AI models failed to analyze' }, 500);
  }

  // Synthesize analyses into unified result
  const promptContext = `Single page analysis for query: "${query}" at URL: ${pageUrl}`;
  const synthesisResult = await synthesizeAnalyses(analyses, promptContext, env);

  if (!synthesisResult.success || !synthesisResult.synthesis) {
    console.error('[AnalyzePage] Synthesis failed:', synthesisResult.error);
    return jsonResponse({ error: 'Failed to synthesize analyses' }, 500);
  }

  const analysis = synthesisResult.synthesis as SinglePageAnalysis;

  // Cache the result
  await env.ANALYTICS.put(cacheKey, JSON.stringify({
    timestamp: Date.now(),
    analysis,
  }), {
    expirationTtl: 24 * 60 * 60, // 24 hours
  });

  return jsonResponse({
    cached: false,
    analysis,
  });
}

interface SinglePageAnalysis {
  overallScore: number;
  contentScore: number;
  layoutScore: number;
  conversionScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
}

/**
 * Extract main content from HTML, removing scripts, styles, and nav
 */
function extractMainContent(html: string): string {
  // Remove script tags
  let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove style tags
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Remove nav, header, footer
  content = content.replace(/<(nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove HTML tags
  content = content.replace(/<[^>]+>/g, ' ');
  // Clean up whitespace
  content = content.replace(/\s+/g, ' ').trim();
  return content;
}

/**
 * Helper to create JSON responses with CORS headers
 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
