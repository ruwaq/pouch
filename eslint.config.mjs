import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Web3 adapter code uses structural typing with `any` for SDK bridging.
      // Warn rather than error — these are deliberate escape hatches.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
