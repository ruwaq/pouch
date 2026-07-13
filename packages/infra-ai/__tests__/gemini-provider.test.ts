import { describe, expect, it } from 'vitest';

import { GeminiProvider } from '../src/gemini-provider';
import type { GeminiClient, GeminiResponse } from '../src/gemini-client';
import { POUCH_SYSTEM_PROMPT, POUCH_TOOL_DECLARATIONS } from '../src/index';

function fakeClient(respond: (req: unknown) => GeminiResponse): GeminiClient & {
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        return respond(request);
      },
    },
  };
}

describe('GeminiProvider.generateWithTools', () => {
  it('returns the first function call when the model calls a tool', async () => {
    const client = fakeClient(() => ({
      functionCalls: [{ name: 'cash_out', args: { amount: 50, brand: 'amazon' } }],
    }));
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

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
    const client = fakeClient(() => ({ text: 'Sure — how much would you like to cash out?' }));
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

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

  it('passes the system instruction, tools, and model to the client', async () => {
    const client = fakeClient(() => ({ functionCalls: [] }));
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    await provider.generateWithTools({
      message: 'cash out $10',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    const sent = (client as { calls: unknown[] }).calls[0] as {
      model: string;
      contents: string;
      config?: { systemInstruction?: string; tools?: unknown[] };
    };
    expect(sent.model).toBe('gemini-2.0-flash');
    expect(sent.contents).toBe('cash out $10');
    expect(sent.config?.systemInstruction).toBe(POUCH_SYSTEM_PROMPT);
    expect(sent.config?.tools).toHaveLength(1);
  });

  it('returns err (never throws) when the client rejects', async () => {
    const client: GeminiClient = {
      models: {
        async generateContent() {
          throw new Error('network down');
        },
      },
    };
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    const result = await provider.generateWithTools({
      message: 'cash out $10',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    expect(result.ok).toBe(false);
  });

  it('returns an empty tool response when the model returns neither a function call nor text', async () => {
    const client = fakeClient(() => ({}));
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

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
    const client = fakeClient(() => ({ text: 'Done! Your Amazon card is ready.' }));
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    const result = await provider.generateText({
      systemInstruction: 'You are Pouch.',
      message: 'Say done',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('Done! Your Amazon card is ready.');
  });

  it('returns err when the client throws', async () => {
    const client: GeminiClient = {
      models: {
        async generateContent() {
          throw new Error('401');
        },
      },
    };
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    const result = await provider.generateText({ systemInstruction: '', message: 'x' });

    expect(result.ok).toBe(false);
  });
});
