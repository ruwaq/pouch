import { describe, expect, it, vi } from 'vitest';

import { GeminiProvider } from '../src/gemini-provider';
import { POUCH_SYSTEM_PROMPT, POUCH_TOOL_DECLARATIONS } from '../src/index';

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
    text: async () => (typeof response === 'string' ? response : JSON.stringify(response)),
  });
}

function geminiResponse(parts: Array<{ functionCall?: { name: string; args: Record<string, unknown> }; text?: string }>) {
  return {
    candidates: [{ content: { parts } }],
  };
}

const provider = new GeminiProvider('test-key', 'gemini-2.0-flash');

describe('GeminiProvider.generateWithTools', () => {
  it('returns the first function call when the model calls a tool', async () => {
    globalThis.fetch = mockFetch(
      geminiResponse([{ functionCall: { name: 'cash_out', args: { amount: 50, brand: 'amazon' } } }]),
    );

    const result = await provider.generateWithTools({
      message: 'cash out $50 to amazon',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.functionCall).toEqual({ name: 'cash_out', args: { amount: 50, brand: 'amazon' } });
  });

  it('returns text when the model replies without a function call', async () => {
    globalThis.fetch = mockFetch(
      geminiResponse([{ text: 'Sure — how much would you like to cash out?' }]),
    );

    const result = await provider.generateWithTools({
      message: 'hi',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.functionCall).toBeUndefined();
    expect(result.value.text).toContain('how much');
  });

  it('returns err (never throws) when fetch rejects', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await provider.generateWithTools({
      message: 'cash out $10',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    expect(result.ok).toBe(false);
  });

  it('returns err when the API returns a non-2xx status', async () => {
    globalThis.fetch = mockFetch({ error: { message: 'invalid key' } }, 400);

    const result = await provider.generateWithTools({
      message: 'cash out $10',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('UNKNOWN');
  });

  it('returns an empty tool response when the model returns neither a function call nor text', async () => {
    globalThis.fetch = mockFetch(geminiResponse([]));

    const result = await provider.generateWithTools({
      message: '...',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.functionCall).toBeUndefined();
    expect(result.value.text).toBeUndefined();
  });
});

describe('GeminiProvider.generateText', () => {
  it('returns the generated text', async () => {
    globalThis.fetch = mockFetch(
      geminiResponse([{ text: 'Done! Your Amazon card is ready.' }]),
    );

    const result = await provider.generateText({
      systemInstruction: 'You are Pouch.',
      message: 'Say done',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('Done! Your Amazon card is ready.');
  });

  it('returns err when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('401'));

    const result = await provider.generateText({ systemInstruction: '', message: 'x' });

    expect(result.ok).toBe(false);
  });
});