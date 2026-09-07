/**
 * Παράγει salt και scrypt hash για έναν κωδικό, ώστε να προστεθεί χρήστης στο
 * data/users.json χωρίς να γραφτεί ποτέ ο κωδικός σε καθαρό κείμενο.
 *
 * Ο κωδικός διαβάζεται από το stdin, όχι ως όρισμα, ώστε να μη μείνει στο
 * ιστορικό του τερματικού:
 *
 *   node scripts/hash-password.js <username> <admin|user>
 *
 * Πληκτρολογήστε τον κωδικό και πατήστε Enter (ή δώστε τον με pipe).
 */
const crypto = require('crypto');

const [username, role] = process.argv.slice(2);

if (!username || !role) {
    console.error('Χρήση: node scripts/hash-password.js <username> <admin|user>');
    process.exit(1);
}

if (role !== 'admin' && role !== 'user') {
    console.error('Ο ρόλος πρέπει να είναι "admin" ή "user".');
    process.exit(1);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });

process.stdin.on('end', () => {
    // Κόβουμε μόνο τα τελικά newline, ώστε ένας κωδικός με κενά να μείνει ακέραιος.
    const password = input.replace(/\r?\n$/, '');

    if (password === '') {
        console.error('Ο κωδικός δεν μπορεί να είναι κενός.');
        process.exit(1);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');

    console.error('\nΑντιγράψτε την παρακάτω εγγραφή μέσα στον πίνακα του data/users.json:\n');
    console.log(JSON.stringify({ username, role, salt, hash }, null, 2));
});
