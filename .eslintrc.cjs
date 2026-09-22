module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    '@electron-toolkit/eslint-config-ts/recommended'
  ],
  ignorePatterns: ['node_modules', 'out', 'dist', 'build', 'resources', '.claude', '*.cjs', '*.js'],
  settings: {
    react: { version: 'detect' }
  },
  rules: {
    // Types carry the contract; prop-types would duplicate it.
    'react/prop-types': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    // A leading underscore is the project's "deliberately unused" marker.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
    ],
    'prettier/prettier': 'off'
  },
  overrides: [
    {
      files: ['tests/**/*.ts', 'tests/**/*.tsx'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' }
    }
  ]
};
