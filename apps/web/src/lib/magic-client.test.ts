import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('magic-client', () => {
  // `getMagic()` caches its instance in a module-level `let instance`.
  // To guarantee each test sees a pristine singleton — regardless of run
  // order or future tests that exercise `getMagic()` — we reset the module
  // registry before every test and re-import the module under test.
  beforeEach(() => {
    vi.resetModules();
  });

  it('hasMagicConfig is false when NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY is unset', async () => {
    const original = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    const { hasMagicConfig } = await import('./magic-client');
    expect(hasMagicConfig()).toBe(false);
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY = original;
  });

  it('hasMagicConfig is true when the key is set', async () => {
    const original = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY = 'pk_test_x';
    const { hasMagicConfig } = await import('./magic-client');
    expect(hasMagicConfig()).toBe(true);
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY = original;
  });

  it('getMagic throws a clear error when no key is configured', async () => {
    const original = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    const { getMagic } = await import('./magic-client');
    expect(() => getMagic()).toThrow(/NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY/);
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY = original;
  });
});
