/**
 * Υποδομή για τα tests του frontend.
 *
 * Στήνει το public/index.html μέσα σε jsdom, υποκαθιστά το fetch με σταθερά
 * δεδομένα και φορτώνει το public/script.js μέσα στο παράθυρο. Έτσι ελέγχεται
 * ο πραγματικός κώδικας της σελίδας, χωρίς server και χωρίς browser.
 */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const FIXTURES = {
    '/api/paintings': {
        landscapes: [
            { id: 1, title: 'Η Ελευθερία οδηγεί τον Λαό', image: 'liberty.jpg', year: '1830', technique: 'Λάδι σε καμβά', museum: 'Λούβρο' }
        ],
        portraits: [
            { id: 2, title: 'Κεφαλή γυναίκας', image: 'head.JPG', year: '1823' },
            // Ο τίτλος περιέχει HTML επίτηδες, για να ελεγχθεί το escaping.
            { id: 3, title: '<script>alert(1)</script>', image: 'evil.png' }
        ]
    },
    '/api/exhibitions': {
        // Η μόνιμη έκθεση δεν έχει ημερομηνία λήξης.
        current: [{ id: 1, name: 'Μόνιμη έκθεση', location: 'Παρίσι', startDate: '1971-01-01', endDate: '' }],
        past: [{ id: 2, name: 'Παλιά έκθεση', location: 'Λονδίνο', startDate: '2016-02-17', endDate: '2016-05-22' }]
    },
    '/api/links': {
        web_links: [
            { id: 1, name: 'Καλός σύνδεσμος', url: 'https://example.org' },
            { id: 2, name: 'Κακός σύνδεσμος', url: 'javascript:alert(1)' }
        ],
        bibliography: [{ id: 3, name: 'Ένα βιβλίο', author: 'Κάποιος' }]
    },
    '/api/biography': {
        birth: { title: 'Γέννηση', paragraphs: ['Πρώτη παράγραφος.', 'Δεύτερη παράγραφος.'] },
        career: { title: 'Έργα', paragraphs: ['Τρίτη παράγραφος.'] }
    }
};

/** Στήνει ένα παράθυρο με φορτωμένη την εφαρμογή. */
async function loadApp({ session = null } = {}) {
    const html = readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
    const { window } = dom;

    const calls = [];

    window.fetch = async (url, options = {}) => {
        const endpoint = String(url).split('?')[0];
        calls.push({ url: endpoint, method: options.method || 'GET' });

        const json = body => ({
            ok: true,
            status: 200,
            json: async () => body
        });

        if (endpoint === '/api/me') {
            return session
                ? json({ success: true, username: session.username, role: session.role })
                : { ok: false, status: 401, json: async () => ({ message: 'Απαιτείται σύνδεση.' }) };
        }
        if (endpoint === '/api/login') {
            return json({ success: true, token: 'test-token', role: 'admin', username: 'admin' });
        }
        if (endpoint === '/api/logout') return json({ success: true });
        if (endpoint.startsWith('/api/biography/')) {
            return json({ success: true, section: { title: 'Αποθηκευμένο', paragraphs: ['Κείμενο.'] } });
        }
        if (FIXTURES[endpoint]) return json(FIXTURES[endpoint]);

        return { ok: false, status: 404, json: async () => ({ message: 'Άγνωστο endpoint.' }) };
    };

    // Το jsdom δεν υλοποιεί τα διαλογικά παράθυρα του browser.
    window.confirm = () => true;
    window.alert = () => {};

    // Το jsdom απαντά πάντα false στα media queries. Προσποιούμαστε συσκευή με
    // ποντίκι, ώστε να μπορεί να ελεγχθεί και η συμπεριφορά του hover. Το
    // element.click() παράγει detail 0, δηλαδή ενεργοποίηση χωρίς δείκτη, οπότε
    // τα υπόλοιπα tests συνεχίζουν να δοκιμάζουν τη διαδρομή πληκτρολογίου.
    window.matchMedia = query => ({
        matches: query.includes('hover: hover'),
        media: query,
        addEventListener() {},
        removeEventListener() {}
    });

    if (session) {
        window.sessionStorage.setItem('delacroix-session', JSON.stringify(session));
    }

    const script = window.document.createElement('script');
    script.textContent = readFileSync(path.join(PUBLIC_DIR, 'script.js'), 'utf8');
    window.document.body.appendChild(script);

    const app = {
        window,
        document: window.document,
        calls,
        main: () => window.document.getElementById('main-content'),
        /** Αλλάζει διαδρομή και περιμένει να ολοκληρωθεί η απόδοση. */
        async go(hash) {
            window.location.hash = hash;
            await app.settle();
        },
        /** Δίνει χρόνο στις εκκρεμείς promises του κώδικα να τρέξουν. */
        async settle(rounds = 12) {
            for (let i = 0; i < rounds; i += 1) {
                await new Promise(resolve => window.setTimeout(resolve, 0));
            }
        },
        /** Περιμένει πραγματικό χρόνο, για τις καθυστερήσεις του hover. */
        async wait(ms) {
            await new Promise(resolve => window.setTimeout(resolve, ms));
            await app.settle();
        },
        /** Στέλνει γεγονός ποντικιού, που το element.click() δεν παράγει. */
        hover(element, type) {
            element.dispatchEvent(new window.MouseEvent(type, { bubbles: false }));
        },
        close: () => window.close()
    };

    await app.settle();
    return app;
}

module.exports = { loadApp, FIXTURES };
