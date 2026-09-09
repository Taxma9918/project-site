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

test('μια ενότητα χωρίς κατηγορία δείχνει τα πάντα', async () => {
    const app = await loadApp();

    await app.go('#/exhibitions');
    assert.match(app.main().querySelector('h2').textContent, /Όλες οι Εκθέσεις/);

    await app.go('#/links');
    assert.match(app.main().querySelector('h2').textContent, /Όλοι οι Σύνδεσμοι/);

    await app.go('#/bio');
    assert.equal(app.main().querySelector('h2').textContent, 'Βιογραφία');

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

test('οι επιλογές μιας ενότητας είναι κρυφές μέχρι να ζητηθούν', async () => {
    const app = await loadApp();
    const toggle = app.document.querySelector('.menu-item > [data-nav="exhibitions"]');
    const panel = app.document.getElementById('exhibitions-menu');

    assert.ok(panel.classList.contains('hidden'), 'αρχικά κρυφές');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');

    toggle.click();
    await app.settle();

    assert.ok(!panel.classList.contains('hidden'), 'άνοιξαν');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    app.close();
});

test('δεύτερο κλικ στην ενότητα κλείνει τις επιλογές', async () => {
    const app = await loadApp();
    const toggle = app.document.querySelector('.menu-item > [data-nav="links"]');
    const panel = app.document.getElementById('links-menu');

    toggle.click();
    await app.settle();
    assert.ok(!panel.classList.contains('hidden'));

    toggle.click();
    await app.settle();
    assert.ok(panel.classList.contains('hidden'), 'έκλεισαν');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    app.close();
});

test('ανοίγει μόνο ένα πάνελ κάθε φορά', async () => {
    const app = await loadApp();

    app.document.querySelector('.menu-item > [data-nav="paintings"]').click();
    await app.settle();
    app.document.querySelector('.menu-item > [data-nav="links"]').click();
    await app.settle();

    assert.ok(app.document.getElementById('paintings-menu').classList.contains('hidden'),
        'το προηγούμενο έκλεισε');
    assert.ok(!app.document.getElementById('links-menu').classList.contains('hidden'));
    const expanded = [...app.document.querySelectorAll('[aria-expanded="true"]')];
    assert.equal(expanded.length, 1, 'ένα μόνο κουμπί δηλώνει ανοιχτό');
    app.close();
});

test('η επιλογή κατηγορίας πλοηγεί και κλείνει τις επιλογές', async () => {
    const app = await loadApp();

    app.document.querySelector('.menu-item > [data-nav="paintings"]').click();
    await app.settle();
    app.document.querySelector('[data-nav="paintings/portraits"]').click();
    await app.settle();

    assert.equal(app.window.location.hash, '#/paintings/portraits');
    assert.match(app.main().querySelector('h2').textContent, /Πορτρέτα/);
    assert.ok(app.document.getElementById('paintings-menu').classList.contains('hidden'),
        'το πάνελ έκλεισε μετά την επιλογή');
    app.close();
});

test('το Escape κλείνει τις επιλογές και επιστρέφει το focus', async () => {
    const app = await loadApp();
    const toggle = app.document.querySelector('.menu-item > [data-nav="bio"]');

    toggle.click();
    await app.settle();
    assert.ok(!app.document.getElementById('bio-menu').classList.contains('hidden'));

    app.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await app.settle();

    assert.ok(app.document.getElementById('bio-menu').classList.contains('hidden'));
    assert.equal(app.document.activeElement, toggle, 'το focus γύρισε στο κουμπί');
    app.close();
});

test('κλικ μέσα στο πάνελ δεν το κλείνει, κλικ έξω το κλείνει', async () => {
    const app = await loadApp();

    app.document.querySelector('.menu-item > [data-nav="paintings"]').click();
    await app.settle();
    const panel = app.document.getElementById('paintings-menu');
    assert.ok(!panel.classList.contains('hidden'));

    // Στοιχείο μέσα στο πάνελ που δεν είναι επιλογή πλοήγησης.
    panel.querySelector('.submenu-hint').click();
    await app.settle();
    assert.ok(!panel.classList.contains('hidden'), 'το κλικ μέσα το αφήνει ανοιχτό');

    app.main().click();
    await app.settle();
    assert.ok(panel.classList.contains('hidden'), 'το κλικ έξω το κλείνει');
    app.close();
});

test('η διαχείριση δεν έχει πτυσσόμενο, πλοηγεί κατευθείαν', async () => {
    const app = await loadApp();
    const toggle = app.document.querySelector('.menu-item > [data-nav="admin"]');

    assert.equal(toggle.getAttribute('aria-controls'), null, 'δεν ελέγχει πάνελ');
    assert.equal(app.document.getElementById('admin-menu'), null, 'δεν υπάρχει πάνελ');

    toggle.click();
    await app.settle();

    assert.equal(app.window.location.hash, '#/admin');
    assert.equal(app.document.querySelectorAll('.submenu:not(.hidden)').length, 0,
        'κανένα πάνελ ανοιχτό');
    app.close();
});

test('ανοιχτό πάνελ κλείνει όταν πάμε στη διαχείριση', async () => {
    const app = await loadApp();

    app.document.querySelector('.menu-item > [data-nav="links"]').click();
    await app.settle();
    assert.ok(!app.document.getElementById('links-menu').classList.contains('hidden'));

    app.document.querySelector('.menu-item > [data-nav="admin"]').click();
    await app.settle();
    assert.ok(app.document.getElementById('links-menu').classList.contains('hidden'), 'έκλεισε');
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

    await app.go('#/admin');
    assert.match(app.main().textContent, /Συνδεδεμένος ως/);
    assert.ok(app.document.getElementById('admin-actions'), 'υπάρχουν οι ενέργειες διαχείρισης');
    assert.equal(app.document.getElementById('login-form'), null, 'όχι φόρμα σύνδεσης');
    app.close();
});

test('χωρίς συνεδρία η οθόνη διαχείρισης δείχνει τη φόρμα σύνδεσης', async () => {
    const app = await loadApp();
    await app.go('#/admin');

    assert.ok(app.document.getElementById('login-form'), 'υπάρχει η φόρμα');
    assert.ok(app.document.getElementById('username'));
    assert.equal(app.document.getElementById('admin-actions'), null, 'καμία ενέργεια διαχείρισης');
    app.close();
});

test('ο επισκέπτης χωρίς δικαιώματα δεν βλέπει ενέργειες διαχείρισης', async () => {
    const app = await loadApp({ session: { token: 't', role: 'user', username: 'user' } });
    await app.go('#/admin');

    assert.match(app.main().textContent, /Συνδεδεμένος ως/);
    assert.equal(app.document.getElementById('admin-actions'), null);
    assert.match(app.main().querySelector('.form-note').textContent, /μόνο για προβολή/);
    app.close();
});

test('σύνδεση και αποσύνδεση μέσα από τη σελίδα', async () => {
    const app = await loadApp();
    await app.go('#/admin');

    app.document.getElementById('username').value = 'admin';
    app.document.getElementById('password').value = '1234';
    app.document.getElementById('login-form').dispatchEvent(
        new app.window.Event('submit', { bubbles: true, cancelable: true }));
    await app.settle();

    assert.ok(app.document.getElementById('admin-actions'), 'εμφανίστηκαν οι ενέργειες');
    assert.equal(app.document.getElementById('login-form'), null, 'η φόρμα έφυγε');

    // Τα στοιχεία ξαναδημιουργούνται σε κάθε απόδοση, οπότε ελέγχουμε ότι οι
    // χειριστές ξανασυνδέονται και μετά την αποσύνδεση.
    app.document.getElementById('logout-button').click();
    await app.settle();

    assert.ok(app.document.getElementById('login-form'), 'η φόρμα ξαναεμφανίστηκε');
    assert.equal(app.document.getElementById('admin-actions'), null);
    app.close();
});

/* --------------------- Διαχείριση βιογραφίας --------------------- */

test('η οθόνη βιογραφίας φορτώνει την ενότητα σε επεξεργάσιμη μορφή', async () => {
    const app = await loadApp({ session: { token: 't', role: 'admin', username: 'admin' } });
    await app.go('#/admin/biography');

    assert.match(app.main().querySelector('h2').textContent, /Διαχείριση: Βιογραφία/);
    assert.equal(app.document.getElementById('bio-title').value, 'Γέννηση');

    const text = app.document.getElementById('bio-paragraphs').value;
    assert.equal(text, 'Πρώτη παράγραφος.\n\nΔεύτερη παράγραφος.',
        'οι παράγραφοι χωρίζονται με κενή γραμμή');

    const options = [...app.document.querySelectorAll('#bio-section option')].map(o => o.value);
    assert.deepEqual(options, ['birth', 'career']);
    app.close();
});

test('η αποθήκευση στέλνει τις παραγράφους χωρισμένες και ακυρώνει το cache', async () => {
    const app = await loadApp({ session: { token: 't', role: 'admin', username: 'admin' } });

    // Πρώτα διαβάζουμε τη βιογραφία, ώστε να μπει στη μνήμη του client.
    await app.go('#/bio/birth');
    const readsBefore = app.calls.filter(c => c.url === '/api/biography').length;

    await app.go('#/admin/biography');
    app.document.getElementById('bio-paragraphs').value = 'Πρώτη.\n\n\n  Δεύτερη.  \n\nΤρίτη.';
    app.document.getElementById('biography-form').dispatchEvent(
        new app.window.Event('submit', { bubbles: true, cancelable: true }));
    await app.settle();

    const put = app.calls.find(c => c.method === 'PUT' && c.url.startsWith('/api/biography/'));
    assert.ok(put, 'στάλθηκε PUT');
    assert.equal(app.document.getElementById('form-saved').hidden, false, 'φαίνεται η επιβεβαίωση');

    // Μετά την αποθήκευση, η δημόσια προβολή πρέπει να ξαναζητήσει το κείμενο
    // αντί να δείξει την παλιά έκδοση από τη μνήμη.
    await app.go('#/bio/birth');
    const readsAfter = app.calls.filter(c => c.url === '/api/biography').length;
    assert.ok(readsAfter > readsBefore, 'το cache ακυρώθηκε');
    app.close();
});

/* --------------------------- Εύρος ημερομηνιών --------------------------- */

test('έκθεση χωρίς λήξη εμφανίζεται ως σε εξέλιξη', async () => {
    const app = await loadApp();
    await app.go('#/exhibitions/current');

    const cells = [...app.main().querySelectorAll('.data-table tbody td')].map(td => td.textContent.trim());
    assert.ok(cells.includes('1971-01-01'), 'φαίνεται η έναρξη');
    assert.ok(cells.includes('σε εξέλιξη'), 'το κενό πεδίο λήξης γράφεται με λόγια');

    const headers = [...app.main().querySelectorAll('.data-table th')].map(th => th.textContent.trim());
    assert.deepEqual(headers, ['Όνομα', 'Τοποθεσία', 'Έναρξη', 'Λήξη']);
    app.close();
});

test('η φόρμα εκθέσεων δεν ζητά κατηγορία, την εξηγεί', async () => {
    const app = await loadApp({ session: { token: 't', role: 'admin', username: 'admin' } });
    await app.go('#/admin/exhibitions');

    assert.equal(app.document.getElementById('form-category'), null, 'δεν υπάρχει επιλογέας');
    assert.match(app.main().querySelector('.form-note').textContent, /προκύπτει από τις ημερομηνίες/);

    const fields = [...app.main().querySelectorAll('#resource-form input')].map(i => i.name);
    assert.deepEqual(fields, ['name', 'location', 'startDate', 'endDate']);

    const required = [...app.main().querySelectorAll('#resource-form input')].filter(i => i.required).map(i => i.name);
    assert.deepEqual(required, ['name', 'location', 'startDate'], 'η λήξη είναι προαιρετική');
    app.close();
});

test('η προεπιλεγμένη κατηγορία σημειώνεται στο μενού', async () => {
    const app = await loadApp();
    await app.go('#/paintings');

    const marked = [...app.document.querySelectorAll('[data-nav][aria-current]')].map(b => b.dataset.nav);
    assert.ok(marked.includes('paintings'), 'η ενότητα');
    assert.ok(marked.includes('paintings/all'),
        'και η προεπιλεγμένη κατηγορία, που είναι αυτή που δείχνει η οθόνη');
    app.close();
});

/* ---------------------------- Άνοιγμα με hover ---------------------------- */

test('ο κέρσορας πάνω από μια ενότητα εμφανίζει τις επιλογές χωρίς κλικ', async () => {
    const app = await loadApp();
    const item = app.document.querySelector('.menu-item:has([data-nav="paintings"])')
        || app.document.querySelector('[data-nav="paintings"]').closest('.menu-item');
    const panel = app.document.getElementById('paintings-menu');

    assert.ok(panel.classList.contains('hidden'), 'αρχικά κρυφές');

    app.hover(item, 'mouseenter');
    await app.wait(250);

    assert.ok(!panel.classList.contains('hidden'), 'άνοιξαν με το hover');
    assert.equal(app.document.querySelector('[data-nav="paintings"]').getAttribute('aria-expanded'), 'true');
    app.close();
});

test('το hover δεν αλλάζει σελίδα', async () => {
    const app = await loadApp();
    await app.go('#/bio/birth');
    const before = app.main().querySelector('h2').textContent;

    app.hover(app.document.querySelector('[data-nav="links"]').closest('.menu-item'), 'mouseenter');
    await app.wait(250);

    assert.equal(app.window.location.hash, '#/bio/birth', 'η διεύθυνση δεν άλλαξε');
    assert.equal(app.main().querySelector('h2').textContent, before, 'ούτε το περιεχόμενο');
    assert.ok(!app.document.getElementById('links-menu').classList.contains('hidden'),
        'αλλά οι επιλογές φαίνονται');
    app.close();
});

test('η απομάκρυνση του κέρσορα κλείνει τις επιλογές', async () => {
    const app = await loadApp();
    const item = app.document.querySelector('[data-nav="exhibitions"]').closest('.menu-item');
    const panel = app.document.getElementById('exhibitions-menu');

    app.hover(item, 'mouseenter');
    await app.wait(250);
    assert.ok(!panel.classList.contains('hidden'));

    app.hover(item, 'mouseleave');
    await app.wait(350);
    assert.ok(panel.classList.contains('hidden'), 'έκλεισαν');
    app.close();
});

test('το γρήγορο πέρασμα του κέρσορα δεν ανοίγει τίποτα', async () => {
    const app = await loadApp();
    const item = app.document.querySelector('[data-nav="paintings"]').closest('.menu-item');

    // Μπαίνει και βγαίνει πριν προλάβει η καθυστέρηση ανοίγματος.
    app.hover(item, 'mouseenter');
    await app.wait(40);
    app.hover(item, 'mouseleave');
    await app.wait(350);

    assert.ok(app.document.getElementById('paintings-menu').classList.contains('hidden'),
        'δεν άνοιξε καθόλου');
    app.close();
});

test('ο κέρσορας πάνω από τη διαχείριση κλείνει ανοιχτές επιλογές', async () => {
    const app = await loadApp();

    app.hover(app.document.querySelector('[data-nav="links"]').closest('.menu-item'), 'mouseenter');
    await app.wait(250);
    assert.ok(!app.document.getElementById('links-menu').classList.contains('hidden'));

    app.hover(app.document.querySelector('[data-nav="admin"]').closest('.menu-item'), 'mouseenter');
    await app.wait(350);

    assert.ok(app.document.getElementById('links-menu').classList.contains('hidden'),
        'η διαχείριση δεν έχει επιλογές, οπότε καθαρίζει τη μπάρα');
    app.close();
});

test('το κλικ στην ενότητα δεν πλοηγεί, μόνο δείχνει τις επιλογές', async () => {
    const app = await loadApp();
    await app.go('#/bio/birth');

    const button = app.document.querySelector('.menu-item > [data-nav="paintings"]');
    const panel = app.document.getElementById('paintings-menu');

    app.hover(button.closest('.menu-item'), 'mouseenter');
    await app.wait(250);
    assert.ok(!panel.classList.contains('hidden'));

    // Το element.click() δίνει detail 0, δηλαδή ενεργοποίηση χωρίς δείκτη.
    // Ένα πραγματικό κλικ ποντικιού έχει detail 1.
    button.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true, detail: 1 }));
    await app.settle();

    assert.equal(app.window.location.hash, '#/bio/birth', 'η σελίδα δεν άλλαξε');
    assert.ok(!panel.classList.contains('hidden'), 'οι επιλογές μένουν ανοιχτές');
    app.close();
});

test('η ενεργοποίηση από πληκτρολόγιο ανοίγει και κλείνει', async () => {
    const app = await loadApp();
    const button = app.document.querySelector('.menu-item > [data-nav="bio"]');
    const panel = app.document.getElementById('bio-menu');

    // Το click() χωρίς δείκτη είναι ό,τι παράγει το Enter σε κουμπί.
    button.click();
    await app.settle();
    assert.ok(!panel.classList.contains('hidden'), 'άνοιξε');

    button.click();
    await app.settle();
    assert.ok(panel.classList.contains('hidden'), 'ξανάκλεισε');
    app.close();
});

/* ------------------------------ Επιλογή "Όλα" ------------------------------ */

test('κάθε ενότητα με επιλογές έχει πρώτο το "Όλα"', async () => {
    const app = await loadApp();

    for (const section of ['bio', 'paintings', 'exhibitions', 'links']) {
        const first = app.document.querySelector(`#${section}-menu ul button`);
        assert.equal(first.textContent.trim(), 'Όλα', `η ενότητα ${section}`);
        assert.equal(first.dataset.nav, `${section}/all`);
    }

    // Η διαχείριση δεν έχει επιλογές, οπότε ούτε "Όλα".
    assert.equal(app.document.getElementById('admin-menu'), null);
    app.close();
});

test('το "Όλα" της βιογραφίας δείχνει όλες τις ενότητες με τους τίτλους τους', async () => {
    const app = await loadApp();
    await app.go('#/bio/all');

    assert.equal(app.main().querySelector('h2').textContent, 'Βιογραφία');
    const headings = [...app.main().querySelectorAll('h3')].map(h => h.textContent);
    assert.deepEqual(headings, ['Γέννηση', 'Έργα']);
    assert.equal(app.main().querySelectorAll('p').length, 3, 'και οι τρεις παράγραφοι');
    app.close();
});

test('το "Όλα" των εκθέσεων δείχνει τρέχουσες και παρελθούσες', async () => {
    const app = await loadApp();
    await app.go('#/exhibitions/all');

    const headings = [...app.main().querySelectorAll('h3')].map(h => h.textContent);
    assert.deepEqual(headings, ['Τρέχουσες Εκθέσεις', 'Παρελθούσες Εκθέσεις']);
    assert.equal(app.main().querySelectorAll('.data-table').length, 2);
    assert.equal(app.main().querySelectorAll('.data-table tbody tr').length, 2);
    app.close();
});

test('το "Όλα" των συνδέσμων κρατά τις σωστές στήλες σε κάθε πίνακα', async () => {
    const app = await loadApp();
    await app.go('#/links/all');

    const tables = [...app.main().querySelectorAll('.data-table')];
    assert.equal(tables.length, 2);

    const columns = tables.map(table =>
        [...table.querySelectorAll('th')].map(th => th.textContent.trim()));
    assert.deepEqual(columns[0], ['Όνομα', 'URL'], 'οι διαδικτυακοί σύνδεσμοι');
    assert.deepEqual(columns[1], ['Τίτλος', 'Συγγραφέας'], 'η βιβλιογραφία');
    app.close();
});

test('το φίλτρο δουλεύει και στη συγκεντρωτική προβολή', async () => {
    const app = await loadApp();
    await app.go('#/links/all');

    const visible = () => [...app.main().querySelectorAll('.data-table tbody tr')]
        .filter(row => !row.hidden).length;
    const input = app.document.getElementById('filter-input');

    assert.equal(visible(), 3, 'και οι τρεις καταχωρήσεις');
    input.value = 'βιβλίο';
    input.dispatchEvent(new app.window.Event('input'));
    assert.equal(visible(), 1, 'φιλτράρει διασχίζοντας και τους δύο πίνακες');
    app.close();
});

test('η επιλογή "Όλα" πλοηγεί και κλείνει τις επιλογές', async () => {
    const app = await loadApp();

    app.document.querySelector('.menu-item > [data-nav="exhibitions"]').click();
    await app.settle();
    app.document.querySelector('[data-nav="exhibitions/all"]').click();
    await app.settle();

    assert.equal(app.window.location.hash, '#/exhibitions/all');
    assert.match(app.main().querySelector('h2').textContent, /Όλες οι Εκθέσεις/);
    assert.ok(app.document.getElementById('exhibitions-menu').classList.contains('hidden'));
    app.close();
});
