const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./client-helpers.js');

/* ------------------------------ Δρομολόγηση ------------------------------ */

test('η αρχική σελίδα δείχνει το μήνυμα καλωσορίσματος', async () => {
    const app = await loadApp();
    assert.match(app.main().textContent, /Καλωσορίσατε/);
    app.close();
});

test('κάθε ενότητα έχει δική της διεύθυνση', async () => {
    const app = await loadApp();

    await app.go('#/paintings/portraits');
    assert.match(app.main().querySelector('h2').textContent, /Πορτρέτα/);

    await app.go('#/links/bibliography');
    assert.match(app.main().querySelector('h2').textContent, /Βιβλιογραφία/);

    await app.go('#/bio/birth');
    assert.match(app.main().querySelector('h2').textContent, /Γέννηση/);
    assert.equal(app.main().querySelectorAll('p').length, 2, 'και οι δύο παράγραφοι');

    app.close();
});

test('μια ενότητα χωρίς κατηγορία δείχνει την προεπιλεγμένη', async () => {
    const app = await loadApp();

    await app.go('#/exhibitions');
    assert.match(app.main().querySelector('h2').textContent, /Τρέχουσες/);

    await app.go('#/links');
    assert.match(app.main().querySelector('h2').textContent, /Διαδικτυακοί/);

    app.close();
});

test('άγνωστη διαδρομή γυρίζει στο καλωσόρισμα', async () => {
    const app = await loadApp();
    await app.go('#/δεν-υπάρχει/καθόλου');
    assert.match(app.main().textContent, /Καλωσορίσατε/);
    app.close();
});

test('το ενεργό στοιχείο μενού σημειώνεται με aria-current', async () => {
    const app = await loadApp();
    await app.go('#/paintings/landscapes');

    const active = [...app.document.querySelectorAll('[data-nav][aria-current]')]
        .map(button => button.dataset.nav);

    assert.ok(active.includes('paintings'), 'το κύριο μενού');
    assert.ok(active.includes('paintings/landscapes'), 'το υπομενού');
    app.close();
});

test('το υπομενού της ενότητας γίνεται ορατό', async () => {
    const app = await loadApp();
    await app.go('#/exhibitions/past');

    assert.ok(!app.document.getElementById('exhibitions-menu').classList.contains('hidden'));
    assert.ok(app.document.getElementById('links-menu').classList.contains('hidden'));
    app.close();
});

/* -------------------------------- Ασφάλεια -------------------------------- */

test('τίτλος με HTML δεν εκτελείται, εμφανίζεται ως κείμενο', async () => {
    const app = await loadApp();
    await app.go('#/paintings/portraits');

    const captions = [...app.main().querySelectorAll('.painting-title')].map(n => n.textContent);
    assert.ok(captions.includes('<script>alert(1)</script>'), 'φαίνεται ως κείμενο');
    assert.equal(app.main().querySelectorAll('script').length, 0, 'δεν μπήκε script στο DOM');
    app.close();
});

test('σύνδεσμος javascript: εξουδετερώνεται', async () => {
    const app = await loadApp();
    await app.go('#/links/web_links');

    const hrefs = [...app.main().querySelectorAll('a')].map(a => a.getAttribute('href'));
    assert.ok(hrefs.includes('https://example.org/'), 'ο κανονικός σύνδεσμος περνά');
    assert.ok(!hrefs.some(h => h.startsWith('javascript:')), 'ο επικίνδυνος όχι');
    app.close();
});

test('η οθόνη διαχείρισης δεν ανοίγει χωρίς δικαιώματα', async () => {
    const app = await loadApp();
    await app.go('#/admin/links');

    assert.equal(app.window.location.hash, '#/admin', 'γυρίζει στη σύνδεση');
    assert.equal(app.main().querySelector('#resource-form'), null, 'καμία φόρμα διαχείρισης');
    app.close();
});

test('με συνεδρία διαχειριστή η οθόνη διαχείρισης ανοίγει', async () => {
    const app = await loadApp({ session: { token: 't', role: 'admin', username: 'admin' } });
    await app.go('#/admin/paintings');

    assert.match(app.main().querySelector('h2').textContent, /Διαχείριση: Πίνακες/);
    const fields = [...app.main().querySelectorAll('#resource-form input')].map(i => i.name);
    assert.deepEqual(fields, ['title', 'image', 'year', 'technique', 'museum']);
    app.close();
});

/* -------------------------------- Εικόνες -------------------------------- */

test('η γκαλερί ζητά μικρογραφίες, με κατάληξη .jpg σε κάθε περίπτωση', async () => {
    const app = await loadApp();
    await app.go('#/paintings/all');

    const sources = [...app.main().querySelectorAll('.painting-card img')]
        .map(img => decodeURIComponent(img.getAttribute('src')));

    assert.ok(sources.every(src => src.startsWith('images/thumbs/')), 'όλες από τα thumbs');
    assert.ok(sources.includes('images/thumbs/head.jpg'), 'το .JPG έγινε .jpg');
    assert.ok(sources.includes('images/thumbs/evil.jpg'), 'το .png έγινε .jpg');
    app.close();
});

test('τα μεταδεδομένα του έργου εμφανίζονται κάτω από τη μικρογραφία', async () => {
    const app = await loadApp();
    await app.go('#/paintings/landscapes');

    const meta = app.main().querySelector('.painting-meta').textContent;
    assert.equal(meta, '1830 · Λάδι σε καμβά · Λούβρο');
    app.close();
});

/* -------------------------------- Lightbox -------------------------------- */

test('το lightbox ανοίγει με την πλήρη εικόνα και επιστρέφει το focus', async () => {
    const app = await loadApp();
    await app.go('#/paintings/landscapes');

    const opener = app.main().querySelector('.painting-open');
    opener.focus();
    opener.click();
    await app.settle();

    const lightbox = app.document.getElementById('lightbox');
    assert.equal(lightbox.hidden, false, 'άνοιξε');
    assert.equal(
        decodeURIComponent(app.document.getElementById('lightbox-image').getAttribute('src')),
        'images/liberty.jpg',
        'πλήρης εικόνα, όχι μικρογραφία'
    );
    assert.match(app.document.getElementById('lightbox-caption').textContent, /Η Ελευθερία οδηγεί τον Λαό · 1830/);
    assert.equal(app.document.activeElement.id, 'lightbox-close', 'το focus μπήκε στο παράθυρο');
    assert.ok(app.document.body.classList.contains('no-scroll'), 'η σελίδα από κάτω κλειδώνει');

    app.document.getElementById('lightbox-close').click();
    await app.settle();

    assert.equal(lightbox.hidden, true, 'έκλεισε');
    assert.equal(app.document.activeElement, opener, 'το focus γύρισε στη μικρογραφία');
    assert.ok(!app.document.body.classList.contains('no-scroll'));
    app.close();
});

test('το Escape κλείνει το lightbox', async () => {
    const app = await loadApp();
    await app.go('#/paintings/landscapes');

    app.main().querySelector('.painting-open').click();
    await app.settle();
    assert.equal(app.document.getElementById('lightbox').hidden, false);

    app.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await app.settle();

    assert.equal(app.document.getElementById('lightbox').hidden, true);
    app.close();
});

/* --------------------------------- Φίλτρο --------------------------------- */

test('το φίλτρο περιορίζει τα έργα καθώς πληκτρολογείς', async () => {
    const app = await loadApp();
    await app.go('#/paintings/all');

    const visible = () => [...app.main().querySelectorAll('.painting-card')].filter(c => !c.hidden).length;
    const input = app.document.getElementById('filter-input');
    const type = value => {
        input.value = value;
        input.dispatchEvent(new app.window.Event('input'));
    };

    assert.equal(visible(), 3, 'αρχικά όλα');

    type('Λούβρο');
    assert.equal(visible(), 1, 'φιλτράρει και με το μουσείο');

    type('1823');
    assert.equal(visible(), 1, 'φιλτράρει και με τη χρονολογία');

    type('κάτι ανύπαρκτο');
    assert.equal(visible(), 0);
    assert.equal(app.document.getElementById('filter-empty').hidden, false, 'εμφανίζεται το μήνυμα');

    type('');
    assert.equal(visible(), 3, 'ο καθαρισμός τα επαναφέρει');
    app.close();
});

test('το φίλτρο δουλεύει και στους πίνακες δεδομένων', async () => {
    const app = await loadApp();
    await app.go('#/links/web_links');

    const visible = () => [...app.main().querySelectorAll('.data-table tbody tr')].filter(r => !r.hidden).length;
    const input = app.document.getElementById('filter-input');

    assert.equal(visible(), 2);
    input.value = 'Καλός';
    input.dispatchEvent(new app.window.Event('input'));
    assert.equal(visible(), 1);
    app.close();
});

/* -------------------------------- Συνεδρία -------------------------------- */

test('αποθηκευμένη συνεδρία επαληθεύεται στον server και επαναφέρεται', async () => {
    const app = await loadApp({ session: { token: 't', role: 'admin', username: 'admin' } });

    assert.ok(app.calls.some(call => call.url === '/api/me'), 'το token ελέγχθηκε');
    assert.equal(app.document.getElementById('session-name').textContent, 'admin');
    assert.ok(app.document.getElementById('login-section').classList.contains('hidden'));
    assert.ok(!app.document.getElementById('admin-actions').classList.contains('hidden'));
    app.close();
});

test('χωρίς συνεδρία εμφανίζεται η φόρμα σύνδεσης', async () => {
    const app = await loadApp();

    assert.ok(!app.document.getElementById('login-section').classList.contains('hidden'));
    assert.ok(app.document.getElementById('session-section').classList.contains('hidden'));
    app.close();
});
