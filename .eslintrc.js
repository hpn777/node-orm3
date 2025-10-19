/**
 * ESLint Configuration for node-orm3
 * 
 * Enforces strict TypeScript practices including:
 * - No explicit `any` types (drives adoption of proper typing)
 * - Strong type checking
 * - Consistent code style
 * - Prevention of common errors
 */

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    es2020: true,
  },
  root: true,
  rules: {
    // ========== STRICT TYPE RULES ==========
    /**
     * Force explicit types instead of `any`
     * This is the PRIMARY driver for the refactoring
     */
    '@typescript-eslint/no-explicit-any': [
      'error',
      {
        fixToUnknown: false,
        ignoreRestArgs: false,
      },
    ],

    /**
     * Warn about unused variables to keep code clean
     */
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],

    /**
     * Require explicit function return types
     */
    '@typescript-eslint/explicit-function-return-types': [
      'warn',
      {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
      },
    ],

    /**
     * Prevent floating promises that aren't handled
     */
    '@typescript-eslint/no-floating-promises': 'error',

    /**
     * Catch misused promises (e.g., passing promise to if statement)
     */
    '@typescript-eslint/no-misused-promises': 'error',

    /**
     * Require proper error handling in promises
     */
    '@typescript-eslint/promise-function-async': 'error',

    /**
     * Require proper async/await usage
     */
    '@typescript-eslint/no-non-null-assertion': 'warn',

    /**
     * Enforce proper null checking
     */
    '@typescript-eslint/strict-boolean-expressions': [
      'warn',
      {
        allowString: false,
        allowNumber: false,
        allowNullableObject: false,
      },
    ],

    // ========== TYPE SAFETY RULES ==========

    /**
     * Prevent implicit any from index access
     */
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',

    /**
     * Enforce consistent method overloads
     */
    '@typescript-eslint/unified-signatures': 'error',

    /**
     * Require consistent return types
     */
    '@typescript-eslint/consistent-return': 'warn',

    /**
     * Prevent unnecessary type assertions
     */
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',

    /**
     * Prevent unnecessary conditionals
     */
    '@typescript-eslint/no-unnecessary-condition': 'warn',

    /**
     * Enforce explicit accessibility modifiers
     */
    '@typescript-eslint/explicit-member-accessibility': [
      'warn',
      {
        accessibility: 'explicit',
        overrides: {
          constructors: 'no-public',
        },
      },
    ],

    /**
     * Enforce consistent naming conventions
     */
    '@typescript-eslint/naming-convention': [
      'warn',
      {
        selector: 'default',
        format: ['camelCase'],
      },
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE'],
      },
      {
        selector: 'typeLike',
        format: ['PascalCase'],
      },
      {
        selector: 'enumMember',
        format: ['PascalCase'],
      },
    ],

    // ========== CODE QUALITY RULES ==========

    /**
     * Prevent console statements in production code
     */
    'no-console': [
      'warn',
      {
        allow: ['warn', 'error'],
      },
    ],

    /**
     * Prevent debugger statements
     */
    'no-debugger': 'error',

    /**
     * Prevent duplicate imports
     */
    'no-duplicate-imports': 'error',

    /**
     * Enforce consistent spacing
     */
    'indent': 'off', // Let prettier handle this
    '@typescript-eslint/indent': 'off', // Let prettier handle this

    /**
     * Enforce semicolons
     */
    '@typescript-eslint/semi': ['error', 'always'],

    /**
     * Enforce single quotes (except for strings with apostrophes)
     */
    '@typescript-eslint/quotes': [
      'error',
      'single',
      {
        avoidEscape: true,
        allowTemplateLiterals: true,
      },
    ],

    /**
     * Enforce consistent comma spacing
     */
    '@typescript-eslint/comma-spacing': 'error',

    /**
     * Enforce consistent object curly spacing
     */
    '@typescript-eslint/object-curly-spacing': ['error', 'always'],

    /**
     * Enforce consistent keyword spacing
     */
    '@typescript-eslint/keyword-spacing': 'error',

    /**
     * Prevent multiple statements on one line
     */
    'no-multiple-empty-lines': ['error', { max: 1 }],

    /**
     * Prevent trailing whitespace
     */
    'no-trailing-spaces': 'error',

    /**
     * Enforce consistent brace style
     */
    'brace-style': ['error', '1tbs'],

    /**
     * Enforce consistent arrow function style
     */
    'arrow-spacing': 'error',

    // ========== PROMISE & ASYNC RULES ==========

    /**
     * Prevent loss of error information
     */
    '@typescript-eslint/no-throw-literal': 'error',

    /**
     * Require return type annotations for functions in libraries
     */
    '@typescript-eslint/no-implied-eval': 'error',

    /**
     * Prevent void operators in incorrect contexts
     */
    '@typescript-eslint/no-void-type': 'off', // Allow for now, will reconsider

    // ========== DISABLED RULES (We'll phase these in) ==========

    /**
     * These are disabled for now but should be enabled as we refactor:
     * - They will become critical after Phase 2
     */
    '@typescript-eslint/no-untyped-public-signature': 'off',
    '@typescript-eslint/no-redundant-type-constituents': 'warn',

    // ========== EXISTING ESLINT COMPATIBILITY ==========

    /**
     * Turn off rules that conflict with our setup
     */
    'no-redeclare': 'off', // TypeScript handles this
    'no-undef': 'off', // TypeScript handles this
  },

  overrides: [
    {
      files: ['test/**/*.js', '**/*.test.ts', '**/*.spec.ts'],
      env: {
        jest: true,
      },
      rules: {
        /**
         * Allow any in tests (more lenient)
         */
        '@typescript-eslint/no-explicit-any': 'warn',

        /**
         * Allow console in tests
         */
        'no-console': 'off',

        /**
         * Allow unused variables in tests
         */
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
    {
      files: ['examples/**/*.js'],
      rules: {
        /**
         * Less strict for examples
         */
        '@typescript-eslint/no-explicit-any': 'warn',
      },
    },
  ],

  // Ignore patterns
  ignorePatterns: [
    'dist',
    'node_modules',
    'coverage',
    '**/*.d.ts',
    'examples',
  ],
};
