import js from '@eslint/js'
import importX from 'eslint-plugin-import-x'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Global ignores (replaces ignorePatterns)
  { ignores: ['dist', 'node_modules', 'cdk.out', '*.js', '*.mjs', '.worktrees'] },

  // Base recommended configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Main config for all TypeScript source files
  {
    files: ['packages/*/src/**/*.ts'],
    plugins: {
      'import-x': importX,
    },
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.base.json', './packages/*/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce no semicolons to match dprint config
      semi: ['error', 'never'],

      // Import ordering: builtin → external → internal → parent → sibling
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // TypeScript specific
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Disallow 'as' type assertions — use Zod .parse() or type guards instead
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
    },
  },

  // Relaxed rules for test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)