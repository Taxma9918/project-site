const js = require('@eslint/js');
const globals = require('globals');

// Κανόνες που ισχύουν παντού, πέρα από τους προτεινόμενους του ESLint.
const sharedRules = {
    // Το error middleware του Express αναγνωρίζεται από το πλήθος των
    // παραμέτρων του, οπότε το next πρέπει να μείνει ακόμη κι αν δεν καλείται.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^(next|unused)$' }],
    eqeqeq: ['error', 'always'],
    'prefer-const': 'error',
    'no-var': 'error',
    curly: ['error', 'multi-line']
};

module.exports = [
    {
        ignores: ['node_modules/**']
    },
    js.configs.recommended,
    {
        // Κώδικας που τρέχει στον Node.
        files: ['server.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node }
        },
        rules: sharedRules
    },
    {
        // Κώδικας που τρέχει στον browser. Δεν είναι module, οπότε οι
        // δηλώσεις πρώτου επιπέδου είναι καθολικές μέσα στη σελίδα.
        files: ['public/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'script',
            globals: { ...globals.browser }
        },
        rules: sharedRules
    }
];
