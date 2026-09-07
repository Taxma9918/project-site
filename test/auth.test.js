/*
 * Τα tests αυθεντικοποίησης ζουν σε ξεχωριστό αρχείο, γιατί ο περιοριστής
 * προσπαθειών κρατά κατάσταση ανά διεύθυνση: αν έτρεχαν μαζί με τα υπόλοιπα,
 * το μπλοκάρισμα θα επηρέαζε και εκείνα. Το node --test δίνει σε κάθε αρχείο
 * δική του διεργασία, άρα και καθαρό μετρητή.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers.js');

let server;

test.before(async () => { server = await startTestServer(); });
test.after(() => server.close());

test('σωστά διαπιστευτήρια επιστρέφουν token και ρόλο', async () => {
    const { status, data } = await server.request('POST', '/api/login', {
        body: { username: 'admin', password: '1234' }
    });
    assert.equal(status, 200);
    assert.equal(data.role, 'admin');
    assert.match(data.token, /^[0-9a-f]{64}$/);
});

test('λάθος κωδικός απορρίπτεται χωρίς να αποκαλύπτει αν υπάρχει ο χρήστης', async () => {
    const wrongPassword = await server.request('POST', '/api/login', {
        body: { username: 'admin', password: 'λάθος' }
    });
    const unknownUser = await server.request('POST', '/api/login', {
        body: { username: 'δεν-υπάρχει', password: 'ό,τι να ναι' }
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownUser.status, 401);
    assert.equal(wrongPassword.data.message, unknownUser.data.message,
        'το μήνυμα πρέπει να είναι ίδιο και στις δύο περιπτώσεις');
});

test('το /api/me επαληθεύει το token', async () => {
    const token = await server.loginAs('admin', '1234');

    const withToken = await server.request('GET', '/api/me', { token });
    assert.equal(withToken.status, 200);
    assert.equal(withToken.data.username, 'admin');

    const withoutToken = await server.request('GET', '/api/me');
    assert.equal(withoutToken.status, 401);

    // Το token ταξιδεύει σε HTTP header, οπότε δοκιμάζουμε με ASCII σκουπίδια.
    const badToken = await server.request('GET', '/api/me', { token: 'not-a-real-token' });
    assert.equal(badToken.status, 401);
});

test('μετά την αποσύνδεση το token δεν ισχύει', async () => {
    const token = await server.loginAs('admin', '1234');
    await server.request('POST', '/api/logout', { token });

    const { status } = await server.request('GET', '/api/me', { token });
    assert.equal(status, 401);
});

// Τελευταίο, γιατί μετά από αυτό η διεύθυνση μένει μπλοκαρισμένη.
test('πέντε αποτυχίες μπλοκάρουν τη σύνδεση με 429', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        const { status } = await server.request('POST', '/api/login', {
            body: { username: 'admin', password: 'λάθος' }
        });
        assert.equal(status, 401, `η προσπάθεια ${attempt} έπρεπε να δώσει 401`);
    }

    const blocked = await server.request('POST', '/api/login', {
        body: { username: 'admin', password: 'λάθος' }
    });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0, 'πρέπει να υπάρχει Retry-After');

    // Όσο κρατά το μπλοκάρισμα, απορρίπτεται ακόμη και ο σωστός κωδικός:
    // αλλιώς ο επιτιθέμενος θα συνέχιζε να δοκιμάζει.
    const correct = await server.request('POST', '/api/login', {
        body: { username: 'admin', password: '1234' }
    });
    assert.equal(correct.status, 429);
});
