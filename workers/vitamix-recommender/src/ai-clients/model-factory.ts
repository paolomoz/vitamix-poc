/**
 * Model Factory - Abstraction layer for AI model selection
 *
 * Allows easy swapping between different models for different roles:
 * - reasoning: Claude Opus for high-quality intent analysis and block selection
 * - content: Cerebras for fast content generation
 * - classification: Fast models for intent classification
 */

import type { Env, ModelRole, ModelConfig, ModelPreset } from '../types';

// ============================================
// Model Presets
// ============================================

const MODEL_PRESETS: Record<string, ModelPreset> = {
  // Production preset: Opus reasoning, Cerebras content
  production: {
    reasoning: {
      provider: 'anthropic',
      model: 'claude-opus-4-5-20251101',
      maxTokens: 4096,
      temperature: 0.7,
    },
    content: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 4096,
      temperature: 0.8,
    },
    classification: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 500,
      temperature: 0.3,
    },
    validation: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 300,
      temperature: 0.2,
    },
  },

  // Fast preset: Sonnet reasoning for faster response
  fast: {
    reasoning: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 2048,
      temperature: 0.7,
    },
    content: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 4096,
      temperature: 0.8,
    },
    classification: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 500,
      temperature: 0.3,
    },
    validation: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 300,
      temperature: 0.2,
    },
  },

  // All-Cerebras preset for cost optimization
  'all-cerebras': {
    reasoning: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 4096,
      temperature: 0.7,
    },
    content: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 4096,
      temperature: 0.8,
    },
    classification: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 500,
      temperature: 0.3,
    },
    validation: {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 300,
      temperature: 0.2,
    },
  },
};

// ============================================
// Message Types
// ============================================

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  duration?: number;
}

// ============================================
// Model Factory Class
// ============================================

export class ModelFactory {
  private preset: ModelPreset;
  private presetName: string;

  constructor(presetName: string = 'production') {
    this.presetName = presetName;
    this.preset = MODEL_PRESETS[presetName] || MODEL_PRESETS.production;
  }

  /**
   * Get the configuration for a specific role
   */
  getConfig(role: ModelRole): ModelConfig {
    return this.preset[role];
  }

  /**
   * Call a model for a specific role
   */
  async call(
    role: ModelRole,
    messages: Message[],
    env: Env
  ): Promise<ModelResponse> {
    const config = this.preset[role];
    const startTime = Date.now();

    let response: ModelResponse;

    switch (config.provider) {
      case 'anthropic':
        response = await this.callAnthropic(config, messages, env);
        break;
      case 'cerebras':
        response = await this.callCerebras(config, messages, env);
        break;
      case 'google':
        response = await this.callGoogle(config, messages, env);
        break;
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }

    response.duration = Date.now() - startTime;
    return response;
  }

  /**
   * Call Anthropic Claude API
   */
  private async callAnthropic(
    config: ModelConfig,
    messages: Message[],
    env: Env
  ): Promise<ModelResponse> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens || 4096,
        temperature: config.temperature || 0.7,
        system: systemMessage?.content || '',
        messages: otherMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    return {
      content: data.content[0]?.text || '',
      model: data.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }

  /**
   * Call Cerebras API
   */
  private async callCerebras(
    config: ModelConfig,
    messages: Message[],
    env: Env
  ): Promise<ModelResponse> {
    const response = await fetch(
      'https://api.cerebras.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.CEREBRAS_API_KEY || env.CEREBRAS_KEY}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature || 0.8,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Cerebras] API error ${response.status}:`, error);
      throw new Error(`Cerebras API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content || '',
      model: data.model,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }

  /**
   * Call Google Gemini API (placeholder)
   */
  private async callGoogle(
    config: ModelConfig,
    messages: Message[],
    env: Env
  ): Promise<ModelResponse> {
    // Placeholder for Google Gemini integration
    throw new Error('Google Gemini integration not yet implemented');
  }

  /**
   * Get the current preset name
   */
  getPresetName(): string {
    return this.presetName;
  }

  /**
   * Get available presets
   */
  static getAvailablePresets(): string[] {
    return Object.keys(MODEL_PRESETS);
  }
}

/**
 * Create a ModelFactory instance from environment
 * @param env - Environment bindings
 * @param presetOverride - Optional preset override from query parameter (allows runtime switching)
 */
export function createModelFactory(env: Env, presetOverride?: string): ModelFactory {
  const preset = presetOverride || env.MODEL_PRESET || 'production';
  return new ModelFactory(preset);
}
