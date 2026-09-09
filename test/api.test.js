const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers.js');

let server;
let adminToken;
let userToken;

test.before(async () => {
    server = await startTestServer();
    adminToken = await server.loginAs('admin', '1234');
    userToken = await server.loginAs('user', 'user1234');
});

test.after(() => server.close());

/* ------------------------- Δημόσια ανάγνωση ------------------------- */

test('τα GET endpoints είναι ανοιχτά χωρίς σύνδεση', async () => {
    for (const endpoint of ['/api/paintings', '/api/exhibitions', '/api/links', '/api/biography']) {
        const { status } = await server.request('GET', endpoint);
        assert.equal(status, 200, `${endpoint} πρέπει να απαντά 200`);
    }
});

test('τα δεδομένα επιστρέφονται ομαδοποιημένα ανά κατηγορία', async () => {
    const { data } = await server.request('GET', '/api/exhibitions');
    assert.ok(Array.isArray(data.current));
    assert.ok(Array.isArray(data.past));
    assert.ok(data.current.every(item => typeof item.id === 'number'));
});

test('η βιογραφία έχει τίτλο και παραγράφους', async () => {
    const { data } = await server.request('GET', '/api/biography');
    for (const entry of Object.values(data)) {
        assert.equal(typeof entry.title, 'string');
        assert.ok(entry.paragraphs.length > 0);
    }
});

/* --------------------------- Δικαιώματα --------------------------- */

test('η εγγραφή χωρίς token απορρίπτεται με 401', async () => {
    const { status } = await server.request('POST', '/api/exhibitions', {
        body: { category: 'current', name: 'X', location: 'Y', date: '2026-01-01' }
    });
    assert.equal(status, 401);
});

test('ο απλός χρήστης δεν μπορεί να γράψει (403)', async () => {
    const { status } = await server.request('POST', '/api/exhibitions', {
        token: userToken,
        body: { category: 'current', name: 'X', location: 'Y', date: '2026-01-01' }
    });
    assert.equal(status, 403);
});

test('ο διαχειριστής μπορεί να γράψει', async () => {
    const { status, data } = await server.request('POST', '/api/exhibitions', {
        token: adminToken,
        body: { category: 'current', name: 'Δοκιμή', location: 'Αθήνα', date: '2026-01-01' }
    });
    assert.equal(status, 201);
    assert.equal(data.item.name, 'Δοκιμή');
});

/* --------------------------- Επικύρωση --------------------------- */

test('τα υποχρεωτικά πεδία ελέγχονται', async () => {
    const cases = [
        [{ category: 'current', name: '', location: 'Αθήνα', date: '2026-01-01' }, 'όνομα'],
        [{ category: 'current', name: 'X', location: '', date: '2026-01-01' }, 'τοποθεσία'],
        [{ category: 'current', name: 'X', location: 'Αθήνα', date: '01/01/2026' }, 'ημερομηνία']
    ];
    for (const [body] of cases) {
        const { status, data } = await server.request('POST', '/api/exhibitions', { token: adminToken, body });
        assert.equal(status, 400);
        assert.equal(data.success, false);
        assert.ok(data.message.length > 0);
    }
});

test('τα URL των συνδέσμων πρέπει να είναι http ή https', async () => {
    const { status } = await server.request('POST', '/api/links', {
        token: adminToken,
        body: { category: 'web_links', name: 'Κακό', url: 'javascript:alert(1)' }
    });
    assert.equal(status, 400);
});

test('η εικόνα πίνακα δεν μπορεί να δείχνει έξω από το images/', async () => {
    for (const image of ['../../server.js', 'images/../../etc/passwd', 'payload.svg', 'no-extension']) {
        const { status } = await server.request('POST', '/api/paintings', {
            token: adminToken,
            body: { category: 'landscapes', title: 'Κακόβουλο', image }
        });
        assert.equal(status, 400, `το "${image}" έπρεπε να απορριφθεί`);
    }
});

test('άγνωστη κατηγορία απορρίπτεται', async () => {
    const { status } = await server.request('POST', '/api/exhibitions', {
        token: adminToken,
        body: { category: 'δεν-υπάρχει', name: 'X', location: 'Y', date: '2026-01-01' }
    });
    assert.equal(status, 400);
});

/* ----------------------- Ακεραιότητα δεδομένων ----------------------- */

test('ο client δεν μπορεί να πλαστογραφήσει το id ή να προσθέσει άγνωστα πεδία', async () => {
    const { data } = await server.request('POST', '/api/exhibitions', {
        token: adminToken,
        body: {
            category: 'current',
            id: 9999,
            name: 'Έλεγχος πεδίων',
            location: 'Αθήνα',
            date: '2026-02-02',
            role: 'admin',
            evil: '<script>'
        }
    });
    assert.notEqual(data.item.id, 9999, 'το id πρέπει να παράγεται από τον server');
    assert.deepEqual(Object.keys(data.item).sort(), ['date', 'id', 'location', 'name']);
});

test('τα προαιρετικά πεδία πίνακα αποθηκεύονται', async () => {
    const { status, data } = await server.request('POST', '/api/paintings', {
        token: adminToken,
        body: {
            category: 'portraits',
            title: 'Με μεταδεδομένα',
            image: 'test.jpg',
            year: '1840',
            technique: 'Λάδι',
            museum: 'Λούβρο'
        }
    });
    assert.equal(status, 201);
    assert.equal(data.item.year, '1840');
    assert.equal(data.item.museum, 'Λούβρο');
});

/* ------------------------------ CRUD ------------------------------ */

test('πλήρης κύκλος: δημιουργία, ενημέρωση, μετακίνηση κατηγορίας, διαγραφή', async () => {
    const created = await server.request('POST', '/api/exhibitions', {
        token: adminToken,
        body: { category: 'current', name: 'Κύκλος', location: 'Αθήνα', date: '2026-03-03' }
    });
    const { id } = created.data.item;

    const updated = await server.request('PUT', `/api/exhibitions/${id}`, {
        token: adminToken,
        body: { category: 'past', name: 'Κύκλος 2', location: 'Πάτρα', date: '2020-03-03' }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.item.name, 'Κύκλος 2');

    const afterMove = await server.request('GET', '/api/exhibitions');
    assert.ok(afterMove.data.past.some(item => item.id === id), 'η εγγραφή μετακινήθηκε στο past');
    assert.ok(!afterMove.data.current.some(item => item.id === id), 'έφυγε από το current');

    const removed = await server.request('DELETE', `/api/exhibitions/${id}`, { token: adminToken });
    assert.equal(removed.status, 200);

    const afterDelete = await server.request('GET', '/api/exhibitions');
    const all = Object.values(afterDelete.data).flat();
    assert.ok(!all.some(item => item.id === id), 'η εγγραφή διαγράφηκε');
});

test('ενημέρωση ή διαγραφή ανύπαρκτης εγγραφής δίνει 404', async () => {
    const put = await server.request('PUT', '/api/exhibitions/999999', {
        token: adminToken,
        body: { category: 'current', name: 'X', location: 'Y', date: '2026-01-01' }
    });
    assert.equal(put.status, 404);

    const del = await server.request('DELETE', '/api/exhibitions/999999', { token: adminToken });
    assert.equal(del.status, 404);
});

test('ταυτόχρονες εγγραφές δεν χάνονται', async () => {
    const before = await server.request('GET', '/api/links');
    const countBefore = Object.values(before.data).flat().length;

    await Promise.all(Array.from({ length: 10 }, (unused, index) =>
        server.request('POST', '/api/links', {
            token: adminToken,
            body: { category: 'bibliography', name: `Παράλληλο ${index}`, author: 'Δοκιμή' }
        })));

    const after = await server.request('GET', '/api/links');
    const items = Object.values(after.data).flat();
    assert.equal(items.length, countBefore + 10, 'και οι 10 εγγραφές πρέπει να έχουν αποθηκευτεί');

    const ids = items.map(item => item.id);
    assert.equal(new Set(ids).size, ids.length, 'τα id πρέπει να είναι μοναδικά');
});

/* --------------------------- Σφάλματα --------------------------- */

test('άγνωστο /api endpoint απαντά με JSON 404', async () => {
    const { status, data } = await server.request('GET', '/api/δεν-υπάρχει');
    assert.equal(status, 404);
    assert.equal(data.success, false);
});

test('χαλασμένο JSON δίνει 400 και όχι 500', async () => {
    const { status, data } = await server.request('POST', '/api/exhibitions', {
        token: adminToken,
        body: '{"broken": }'
    });
    assert.equal(status, 400);
    assert.equal(data.success, false);
});

/* ------------------------------ Βιογραφία ------------------------------ */

test('η βιογραφία ενημερώνεται μόνο από διαχειριστή', async () => {
    const body = { title: 'Νέος τίτλος', paragraphs: ['Μία παράγραφος.'] };

    const anonymous = await server.request('PUT', '/api/biography/birth', { body });
    assert.equal(anonymous.status, 401);

    const visitor = await server.request('PUT', '/api/biography/birth', { token: userToken, body });
    assert.equal(visitor.status, 403);
});

test('άγνωστη ενότητα βιογραφίας δίνει 404', async () => {
    const { status } = await server.request('PUT', '/api/biography/δεν-υπάρχει', {
        token: adminToken,
        body: { title: 'X', paragraphs: ['Y'] }
    });
    assert.equal(status, 404);
});

test('η βιογραφία απαιτεί τίτλο και τουλάχιστον μία παράγραφο', async () => {
    const cases = [
        { title: '', paragraphs: ['Κείμενο.'] },
        { title: 'Τίτλος', paragraphs: [] },
        { title: 'Τίτλος', paragraphs: ['   ', ''] },
        { title: 'Τίτλος', paragraphs: 'όχι πίνακας' }
    ];
    for (const body of cases) {
        const { status, data } = await server.request('PUT', '/api/biography/birth', { token: adminToken, body });
        assert.equal(status, 400, `το ${JSON.stringify(body)} έπρεπε να απορριφθεί`);
        assert.ok(data.message.length > 0);
    }
});

test('η ενημέρωση βιογραφίας καθαρίζει τα κενά και αφήνει ήσυχες τις άλλες ενότητες', async () => {
    const before = await server.request('GET', '/api/biography');
    const otherBefore = before.data.career;

    const updated = await server.request('PUT', '/api/biography/birth', {
        token: adminToken,
        body: { title: '  Γέννηση  ', paragraphs: ['  Πρώτη.  ', '   ', 'Δεύτερη.'] }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.section.title, 'Γέννηση', 'ο τίτλος καθαρίζεται');
    assert.deepEqual(updated.data.section.paragraphs, ['Πρώτη.', 'Δεύτερη.'], 'οι κενές παράγραφοι πέφτουν');

    const after = await server.request('GET', '/api/biography');
    assert.deepEqual(after.data.birth, updated.data.section, 'η αλλαγή διαβάζεται πίσω');
    assert.deepEqual(after.data.career, otherBefore, 'η άλλη ενότητα δεν άλλαξε');
});
