module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    '@vue/eslint-config-typescript',
    'prettier'
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 'latest',
    parser: '@typescript-eslint/parser',
    sourceType: 'module'
  },
  rules: {
    'vue/no-v-html': 'error',
    'no-console': ['warn', { allow: ['error', 'warn'] }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-restricted-imports': ['error', {
      paths: [
        { name: 'firebase/firestore', message: 'Firebase SDK must only be imported inside /src/services/ files.' },
        { name: 'firebase/storage', message: 'Firebase SDK must only be imported inside /src/services/ files.' },
        { name: 'firebase/auth', message: 'Firebase SDK must only be imported inside /src/services/ files.' }
      ]
    }]
  }
}
