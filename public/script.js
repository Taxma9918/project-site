/* ================================================================
 * Διαδικτυακή Εφαρμογή Ευγένιου Ντελακρουά — client-side κώδικας
 * ================================================================ */

const mainContent = document.getElementById('main-content');

// Τρέχουσα συνεδρία: { token, role, username } ή null όταν δεν υπάρχει σύνδεση.
let session = null;

// Κλειδί αποθήκευσης της συνεδρίας. Χρησιμοποιούμε sessionStorage και όχι
// localStorage, ώστε το token να σβήνεται μόλις κλείσει η καρτέλα.
const SESSION_KEY = 'delacroix-session';

/* ----------------------------- Βοηθητικά ----------------------------- */

/** Κάνει escape ό,τι μπαίνει σε innerHTML, ώστε τα δεδομένα να μην εκτελούνται ως HTML. */
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

/** Επιτρέπει μόνο http/https συνδέσμους, ώστε να μην περνούν javascript: URLs. */
function safeUrl(url) {
    try {
        const parsed = new URL(url, window.location.origin);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
    } catch {
        return '#';
    }
}

/** fetch με αυτόματο Authorization header και ενιαίο χειρισμό σφαλμάτων. */
async function api(url, options = {}) {
    const headers = { ...options.headers };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (session) headers['Authorization'] = `Bearer ${session.token}`;

    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        // Ληγμένο ή άκυρο token: καθαρίζουμε τη συνεδρία, αλλά αφήνουμε τον
        // caller να δείξει το μήνυμα σφάλματος αντί να αλλάξουμε εμείς οθόνη.
        if (response.status === 401 && session) logout({ render: false });
        throw new Error(data.message || `Σφάλμα ${response.status}`);
    }
    return data;
}

function showError(message) {
    mainContent.innerHTML = `<p class="error">${esc(message)}</p>`;
}

/** Ενδιάμεση κατάσταση, ώστε η οθόνη να μη μένει κενή όσο φορτώνουν τα δεδομένα. */
function showLoading(label = 'Φόρτωση…') {
    mainContent.innerHTML = `<p class="loading" role="status">${esc(label)}</p>`;
}

/* ------------------------------ Δρομολόγηση ------------------------------ */
/*
 * Η κατάσταση της εφαρμογής ζει στο hash του URL (π.χ. #/paintings/portraits),
 * ώστε κάθε ενότητα να έχει δικό της σύνδεσμο: μπορεί να μπει σε σελιδοδείκτη,
 * να σταλεί σε κάποιον, και τα κουμπιά «πίσω»/«μπροστά» του browser δουλεύουν.
 */

const MENUS = ['bio', 'paintings', 'exhibitions', 'links', 'admin'];

// Κάθε ενότητα ανοίγει στην επιλογή "Όλα": το κουμπί της ενότητας δεν πλοηγεί
// πια, οπότε η προεπιλογή αφορά μόνο τις απευθείας διευθύνσεις (π.χ. #/links).
const DEFAULT_CATEGORY = {
    bio: 'all',
    paintings: 'all',
    exhibitions: 'all',
    links: 'all'
};

function navigate(path) {
    const target = `#/${path}`;
    // Αν το hash δεν αλλάζει, το hashchange δεν πυροδοτείται: ζωγραφίζουμε εμείς.
    if (location.hash === target) route();
    else location.hash = target;
}

/*
 * Οι επιλογές κάθε ενότητας ζουν σε πτυσσόμενο πάνελ κάτω από το κουμπί της.
 * Ανοίγει ένα κάθε φορά· η κατάσταση δηλώνεται με aria-expanded, ώστε να τη
 * διαβάζουν και οι αναγνώστες οθόνης.
 */
let openMenu = null;

/*
 * Με ποντίκι οι επιλογές ανοίγουν μόλις περάσει από πάνω ο κέρσορας. Σε οθόνη
 * αφής δεν υπάρχει hover, και στο πληκτρολόγιο δεν υπάρχει κέρσορας: εκεί
 * μένει το κλικ, γι' αυτό το hover προστίθεται μόνο όταν η συσκευή το έχει.
 */
const hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

let hoverTimer = null;

function menuToggle(menu) {
    return document.querySelector(`.menu-item > [data-nav="${menu}"]`);
}

function closeSubmenu({ restoreFocus = false } = {}) {
    clearTimeout(hoverTimer);
    if (!openMenu) return;
    document.getElementById(`${openMenu}-menu`)?.classList.add('hidden');

    const toggle = menuToggle(openMenu);
    toggle?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle?.focus();

    openMenu = null;
}

function openSubmenu(menu) {
    clearTimeout(hoverTimer);
    if (openMenu === menu) return;
    closeSubmenu();

    const panel = document.getElementById(`${menu}-menu`);
    if (!panel) return;

    panel.classList.remove('hidden');
    menuToggle(menu)?.setAttribute('aria-expanded', 'true');
    openMenu = menu;
}

/** Σημειώνει το ενεργό στοιχείο μενού, για τον χρήστη και για τους screen readers. */
function markActive(menu, path) {
    document.querySelectorAll('[data-nav]').forEach(button => {
        const nav = button.dataset.nav;
        if (nav === path || nav === menu) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
    });
}

async function route() {
    const path = location.hash.replace(/^#\/?/, '');
    const [menu, category] = path.split('/');

    if (!MENUS.includes(menu)) {
        markActive(null, '');
        mainContent.innerHTML = '<p>Καλωσορίσατε! Επιλέξτε μια επιλογή από το μενού.</p>';
        return;
    }

    // Όταν δεν δίνεται κατηγορία, ενεργή είναι η προεπιλεγμένη: το μενού πρέπει
    // να τη σημειώνει, γιατί αυτήν ακριβώς δείχνει η οθόνη.
    const active = !category && DEFAULT_CATEGORY[menu] ? `${menu}/${DEFAULT_CATEGORY[menu]}` : path;
    markActive(menu, active);

    try {
        if (menu === 'admin') await showAdmin(category);
        else if (menu === 'bio') await showBiographySection(category || DEFAULT_CATEGORY.bio);
        else if (menu === 'paintings') await showPaintings(category || DEFAULT_CATEGORY.paintings);
        else await showResource(menu, category || DEFAULT_CATEGORY[menu]);
    } finally {
        // Μετά την πλοήγηση το focus πάει στο νέο περιεχόμενο, ώστε ο χρήστης
        // πληκτρολογίου να μη χρειάζεται να ξαναδιασχίσει όλο το μενού.
        mainContent.focus({ preventScroll: true });
    }
}

/* ------------------------------ Βιογραφία ------------------------------ */

// Το κείμενο ζει στο data/biography.json. Το κρατάμε στη μνήμη μετά την πρώτη φόρτωση.
let biography = null;

async function loadBiography() {
    biography ??= await api('/api/biography');
    return biography;
}

async function showBiographySection(section) {
    if (!biography) showLoading();
    try {
        const data = await loadBiography();
        const showAll = section === 'all';
        const keys = showAll ? Object.keys(data) : [section];

        if (!keys.every(key => data[key])) {
            showError('Η ενότητα βιογραφίας δεν βρέθηκε.');
            return;
        }

        mainContent.innerHTML = `
            <h2>${esc(showAll ? 'Βιογραφία' : data[section].title)}</h2>
            ${keys.map(key => `
                ${showAll ? `<h3>${esc(data[key].title)}</h3>` : ''}
                ${data[key].paragraphs.map(text => `<p>${esc(text)}</p>`).join('')}
            `).join('')}
        `;
    } catch (error) {
        console.error('Error loading biography:', error);
        showError('Σφάλμα κατά τη φόρτωση της βιογραφίας.');
    }
}

/* ------------------------------- Πίνακες ------------------------------- */

const PAINTING_TITLES = {
    all: 'Οι Πίνακες του Ντελακρουά',
    landscapes: 'Τοπία του Ντελακρουά',
    portraits: 'Πορτρέτα του Ντελακρουά'
};

/** Η διαδρομή της πλήρους εικόνας ενός έργου. */
function fullImageUrl(image) {
    return `images/${encodeURIComponent(image)}`;
}

/**
 * Η διαδρομή της μικρογραφίας. Οι μικρογραφίες είναι πάντα JPEG, οπότε η
 * κατάληξη αντικαθίσταται: με X-Content-Type-Options: nosniff μια λάθος
 * δηλωμένη μορφή δεν θα εμφανιζόταν καθόλου.
 */
function thumbImageUrl(image) {
    const jpeg = image.replace(/\.[^.]+$/, '.jpg');
    return `images/thumbs/${encodeURIComponent(jpeg)}`;
}

/** Τα δευτερεύοντα στοιχεία ενός έργου, όσα από αυτά έχουν συμπληρωθεί. */
function paintingDetails(painting) {
    return [painting.year, painting.technique, painting.museum].filter(Boolean);
}

// Τα τελευταία φορτωμένα έργα, ώστε το lightbox να βρίσκει το σωστό με βάση το id.
let loadedPaintings = [];

async function showPaintings(category) {
    showLoading('Φόρτωση πινάκων…');
    try {
        const data = await api('/api/paintings');
        loadedPaintings = Object.values(data).flat();

        const paintings = category === 'all'
            ? loadedPaintings
            : data[category] || [];

        mainContent.innerHTML = `
            <h2>${esc(PAINTING_TITLES[category] || PAINTING_TITLES.all)}</h2>
            ${renderFilter('Αναζήτηση σε τίτλο, χρονολογία ή μουσείο…')}
            <div class="paintings-grid">
                ${paintings.map(painting => `
                    <figure class="painting-card">
                        <button type="button" class="painting-open" data-painting="${esc(painting.id)}"
                                aria-label="Μεγέθυνση: ${esc(painting.title)}">
                            <img src="${esc(thumbImageUrl(painting.image))}"
                                 data-full="${esc(fullImageUrl(painting.image))}"
                                 alt="${esc(painting.title)}" loading="lazy" decoding="async">
                        </button>
                        <figcaption>
                            <span class="painting-title">${esc(painting.title)}</span>
                            ${paintingDetails(painting).length
                                ? `<span class="painting-meta">${esc(paintingDetails(painting).join(' · '))}</span>`
                                : ''}
                        </figcaption>
                    </figure>
                `).join('')}
            </div>
            <p id="filter-empty" class="filter-empty" hidden>Δεν βρέθηκαν έργα με αυτόν τον όρο.</p>
        `;

        wireFilter('.painting-card');

        // Ένα έργο που προστέθηκε από τη διαχείριση δεν έχει ακόμη μικρογραφία:
        // αντί για σπασμένο εικονίδιο, δείχνουμε την πλήρη εικόνα.
        mainContent.querySelectorAll('.painting-card img').forEach(image =>
            image.addEventListener('error', () => {
                if (image.dataset.full) image.src = image.dataset.full;
            }, { once: true }));

        mainContent.querySelectorAll('.painting-open').forEach(button =>
            button.addEventListener('click', () => {
                const painting = loadedPaintings.find(p => String(p.id) === button.dataset.painting);
                if (painting) openLightbox(painting);
            }));
    } catch (error) {
        console.error('Error loading paintings:', error);
        showError('Σφάλμα κατά τη φόρτωση των πινάκων.');
    }
}

/* ------------------------------- Lightbox ------------------------------- */

const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxClose = document.getElementById('lightbox-close');

// Ποιο στοιχείο είχε το focus πριν ανοίξει, ώστε να του το επιστρέψουμε.
let lightboxOpener = null;

function openLightbox(painting) {
    lightboxOpener = document.activeElement;
    // Στη μεγέθυνση θέλουμε την πλήρη ανάλυση, όχι τη μικρογραφία.
    lightboxImage.src = fullImageUrl(painting.image);
    lightboxImage.alt = painting.title;
    lightboxCaption.textContent = [painting.title, ...paintingDetails(painting)].join(' · ');
    lightbox.hidden = false;
    document.body.classList.add('no-scroll');
    lightboxClose.focus();
}

function closeLightbox() {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    lightboxImage.removeAttribute('src');
    document.body.classList.remove('no-scroll');
    lightboxOpener?.focus();
    lightboxOpener = null;
}

lightboxClose.addEventListener('click', closeLightbox);

// Κλικ στο σκοτεινό φόντο (και όχι στην εικόνα) κλείνει το παράθυρο.
lightbox.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', event => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    // Το μόνο εστιάσιμο στοιχείο μέσα στο παράθυρο είναι το κουμπί κλεισίματος,
    // οπότε κρατάμε εκεί το focus όσο είναι ανοιχτό.
    if (event.key === 'Tab') {
        event.preventDefault();
        lightboxClose.focus();
    }
});

/* -------------------------------- Φίλτρο -------------------------------- */

function renderFilter(placeholder) {
    return `
        <div class="filter">
            <label for="filter-input">Αναζήτηση</label>
            <input type="search" id="filter-input" placeholder="${esc(placeholder)}"
                   autocomplete="off" spellcheck="false">
        </div>
    `;
}

/** Φιλτράρει τα ήδη φορτωμένα στοιχεία, χωρίς νέο αίτημα στον server. */
function wireFilter(selector) {
    const input = document.getElementById('filter-input');
    const empty = document.getElementById('filter-empty');
    if (!input) return;

    const items = [...mainContent.querySelectorAll(selector)];
    input.addEventListener('input', () => {
        const term = input.value.trim().toLowerCase();
        let visible = 0;
        for (const item of items) {
            const match = !term || item.textContent.toLowerCase().includes(term);
            item.hidden = !match;
            if (match) visible += 1;
        }
        if (empty) empty.hidden = visible > 0 || items.length === 0;
    });
}

/* --------------------- Εκθέσεις & Σύνδεσμοι (προβολή) --------------------- */

/**
 * Ρυθμίσεις ανά πόρο: κατηγορίες, στήλες πίνακα και πεδία φόρμας.
 * Χρησιμοποιούνται τόσο στην απλή προβολή όσο και στη διαχείριση,
 * ώστε ο ίδιος κώδικας να καλύπτει πίνακες, εκθέσεις και συνδέσμους.
 */
const RESOURCES = {
    paintings: {
        title: 'Πίνακες',
        categories: { landscapes: 'Τοπία', portraits: 'Πορτρέτα' },
        columns: () => [
            { key: 'title', label: 'Τίτλος' },
            { key: 'year', label: 'Χρονολογία' },
            { key: 'museum', label: 'Μουσείο' },
            { key: 'image', label: 'Αρχείο εικόνας' }
        ],
        fields: () => [
            { name: 'title', label: 'Τίτλος', type: 'text', required: true },
            { name: 'image', label: 'Αρχείο εικόνας (μέσα στο public/images/)', type: 'text', required: true },
            { name: 'year', label: 'Χρονολογία', type: 'text' },
            { name: 'technique', label: 'Τεχνική', type: 'text' },
            { name: 'museum', label: 'Μουσείο', type: 'text' }
        ]
    },
    exhibitions: {
        title: 'Εκθέσεις',
        allTitle: 'Όλες οι Εκθέσεις',
        categories: { current: 'Τρέχουσες Εκθέσεις', past: 'Παρελθούσες Εκθέσεις' },
        // Η κατηγορία προκύπτει στον server από τις ημερομηνίες, οπότε η φόρμα
        // δεν εμφανίζει επιλογέα: δεν έχει νόημα να τη διαλέγει ο χρήστης.
        derivedCategory: true,
        columns: () => [
            { key: 'name', label: 'Όνομα' },
            { key: 'location', label: 'Τοποθεσία' },
            { key: 'startDate', label: 'Έναρξη' },
            { key: 'endDate', label: 'Λήξη', format: value => value || 'σε εξέλιξη' }
        ],
        fields: () => [
            { name: 'name', label: 'Όνομα', type: 'text', required: true },
            { name: 'location', label: 'Τοποθεσία', type: 'text', required: true },
            { name: 'startDate', label: 'Έναρξη', type: 'date', required: true },
            { name: 'endDate', label: 'Λήξη (κενό για μόνιμη έκθεση)', type: 'date' }
        ]
    },
    links: {
        title: 'Σύνδεσμοι',
        allTitle: 'Όλοι οι Σύνδεσμοι',
        categories: { web_links: 'Διαδικτυακοί Σύνδεσμοι', bibliography: 'Βιβλιογραφία' },
        columns: category => category === 'web_links'
            ? [{ key: 'name', label: 'Όνομα' }, { key: 'url', label: 'URL', type: 'link' }]
            : [{ key: 'name', label: 'Τίτλος' }, { key: 'author', label: 'Συγγραφέας' }],
        fields: category => category === 'web_links'
            ? [{ name: 'name', label: 'Όνομα', type: 'text', required: true },
               { name: 'url', label: 'URL', type: 'url', required: true }]
            : [{ name: 'name', label: 'Τίτλος', type: 'text', required: true },
               { name: 'author', label: 'Συγγραφέας', type: 'text', required: true }]
    }
};

function renderCell(item, column) {
    const value = item[column.key];
    if (column.type === 'link') {
        return `<a href="${esc(safeUrl(value))}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>`;
    }
    // Η μορφοποίηση τρέχει πριν το escaping, ώστε το αποτέλεσμα να παραμένει ασφαλές.
    return esc(column.format ? column.format(value) : value);
}

function renderTable(columns, items, extraColumn = null) {
    if (!items.length) {
        return '<p>Δεν υπάρχουν καταχωρήσεις.</p>';
    }
    return `
        <table class="data-table">
            <thead>
                <tr>
                    ${columns.map(column => `<th>${esc(column.label)}</th>`).join('')}
                    ${extraColumn ? `<th>${esc(extraColumn)}</th>` : ''}
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        ${columns.map(column => `<td>${renderCell(item, column)}</td>`).join('')}
                        ${extraColumn ? `
                            <td class="row-actions">
                                <button type="button" data-action="edit" data-id="${esc(item.id)}">Επεξεργασία</button>
                                <button type="button" class="danger" data-action="delete" data-id="${esc(item.id)}">Διαγραφή</button>
                            </td>
                        ` : ''}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function showResource(resource, category) {
    const config = RESOURCES[resource];
    const showAll = category === 'all';

    if (!showAll && !config?.categories[category]) {
        showError('Η κατηγορία δεν βρέθηκε.');
        return;
    }
    showLoading();
    try {
        const data = await api(`/api/${resource}`);
        // Στο "Όλα" κάθε κατηγορία παίρνει δικό της πίνακα, γιατί οι στήλες
        // τους δεν είναι πάντα ίδιες: οι σύνδεσμοι έχουν URL, η βιβλιογραφία
        // συγγραφέα.
        const keys = showAll ? Object.keys(config.categories) : [category];
        const total = keys.reduce((sum, key) => sum + (data[key] || []).length, 0);

        mainContent.innerHTML = `
            <h2>${esc(showAll ? config.allTitle : config.categories[category])}</h2>
            ${total ? renderFilter('Αναζήτηση στις καταχωρήσεις…') : ''}
            ${keys.map(key => `
                ${showAll ? `<h3>${esc(config.categories[key])}</h3>` : ''}
                ${renderTable(config.columns(key), data[key] || [])}
            `).join('')}
            <p id="filter-empty" class="filter-empty" hidden>Δεν βρέθηκαν καταχωρήσεις με αυτόν τον όρο.</p>
        `;
        wireFilter('.data-table tbody tr');
    } catch (error) {
        console.error(`Error loading ${resource}:`, error);
        showError('Σφάλμα κατά τη φόρτωση των δεδομένων.');
    }
}

/* --------------------------- Διαχείριση (CRUD) --------------------------- */

// Ποια εγγραφή επεξεργαζόμαστε αυτή τη στιγμή (null = προσθήκη νέας).
let editing = null;
// Η κατηγορία που είναι επιλεγμένη στη φόρμα (καθορίζει ποια πεδία εμφανίζονται).
let formCategory = null;

async function showAdmin(resource) {
    if (resource) {
        if (resource !== 'biography' && !RESOURCES[resource]) {
            showError('Άγνωστη ενότητα διαχείρισης.');
            return;
        }
        if (session?.role !== 'admin') {
            // Χωρίς δικαιώματα δεν έχει νόημα η οθόνη: πίσω στη σύνδεση.
            navigate('admin');
            return;
        }
        if (resource === 'biography') await manageBiography();
        else await manageResource(resource);
        return;
    }

    editing = null;
    formCategory = null;

    mainContent.innerHTML = session ? renderSessionPanel() : renderLoginForm();

    // Τα στοιχεία ξαναδημιουργούνται σε κάθε απόδοση, οπότε συνδέονται εδώ.
    document.getElementById('login-form')?.addEventListener('submit', login);
    document.getElementById('logout-button')?.addEventListener('click', () => logout());
}

function renderLoginForm() {
    return `
        <h2>Διαχείριση</h2>
        <p>Συνδεθείτε για να διαχειριστείτε το περιεχόμενο του ιστότοπου.</p>

        <form id="login-form" class="resource-form">
            <h3>Σύνδεση Χρήστη</h3>
            <label for="username">Όνομα Χρήστη</label>
            <input type="text" id="username" name="username" autocomplete="username" required>
            <label for="password">Κωδικός</label>
            <input type="password" id="password" name="password" autocomplete="current-password" required>
            <div class="form-actions">
                <button type="submit">Σύνδεση</button>
            </div>
            <p id="login-error" class="error" role="alert" hidden></p>
        </form>
    `;
}

function renderSessionPanel() {
    const isAdmin = session.role === 'admin';
    return `
        <h2>Διαχείριση</h2>
        <p>Συνδεδεμένος ως <strong>${esc(session.username)}</strong>.</p>

        <div class="admin-panel">
            ${isAdmin ? `
                <div id="admin-actions" class="admin-section">
                    <button type="button" data-nav="admin/biography">Διαχείριση Βιογραφίας</button>
                    <button type="button" data-nav="admin/paintings">Διαχείριση Πινάκων</button>
                    <button type="button" data-nav="admin/exhibitions">Διαχείριση Εκθέσεων</button>
                    <button type="button" data-nav="admin/links">Διαχείριση Συνδέσμων</button>
                </div>
            ` : '<p class="form-note">Ο λογαριασμός σας έχει δικαιώματα μόνο για προβολή.</p>'}
            <button type="button" id="logout-button">Αποσύνδεση</button>
        </div>
    `;
}

// Ποια ενότητα βιογραφίας είναι ανοιχτή στη φόρμα.
let biographySection = null;

/**
 * Η βιογραφία δεν έχει εγγραφές με id, οπότε δεν περνά από τη γενική φόρμα:
 * κάθε ενότητα έχει έναν τίτλο και τις παραγράφους της.
 */
async function manageBiography() {
    try {
        const data = await api('/api/biography');
        const sections = Object.keys(data);
        if (!sections.includes(biographySection)) biographySection = sections[0];
        const entry = data[biographySection];

        mainContent.innerHTML = `
            <h2>Διαχείριση: Βιογραφία</h2>

            <form id="biography-form" class="resource-form">
                <label for="bio-section">Ενότητα</label>
                <select id="bio-section">
                    ${sections.map(key => `
                        <option value="${esc(key)}" ${key === biographySection ? 'selected' : ''}>
                            ${esc(data[key].title)}
                        </option>
                    `).join('')}
                </select>

                <label for="bio-title">Τίτλος</label>
                <input type="text" id="bio-title" value="${esc(entry.title)}" required>

                <label for="bio-paragraphs">Κείμενο (αφήστε κενή γραμμή ανάμεσα στις παραγράφους)</label>
                <textarea id="bio-paragraphs" rows="18" required>${esc(entry.paragraphs.join('\n\n'))}</textarea>

                <div class="form-actions">
                    <button type="submit">Αποθήκευση</button>
                </div>
                <p id="form-error" class="error" role="alert" hidden></p>
                <p id="form-saved" class="saved" role="status" hidden>Οι αλλαγές αποθηκεύτηκαν.</p>
            </form>
        `;

        wireBiographyForm();
    } catch (error) {
        console.error('Error loading biography:', error);
        showError(error.message);
    }
}

function wireBiographyForm() {
    const form = document.getElementById('biography-form');
    const formError = document.getElementById('form-error');
    const saved = document.getElementById('form-saved');

    document.getElementById('bio-section').addEventListener('change', event => {
        biographySection = event.target.value;
        manageBiography();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        formError.hidden = true;
        saved.hidden = true;

        // Οι παράγραφοι χωρίζονται με κενή γραμμή, όπως λέει η ετικέτα.
        const paragraphs = document.getElementById('bio-paragraphs').value
            .split(/\n\s*\n/)
            .map(text => text.trim())
            .filter(Boolean);

        try {
            await api(`/api/biography/${encodeURIComponent(biographySection)}`, {
                method: 'PUT',
                body: JSON.stringify({
                    title: document.getElementById('bio-title').value,
                    paragraphs
                })
            });
            // Η δημόσια προβολή κρατά το κείμενο στη μνήμη: το ακυρώνουμε,
            // αλλιώς θα συνέχιζε να δείχνει την παλιά έκδοση.
            biography = null;
            saved.hidden = false;
        } catch (error) {
            formError.textContent = error.message;
            formError.hidden = false;
        }
    });
}

async function manageResource(resource) {
    const config = RESOURCES[resource];
    const categories = Object.keys(config.categories);
    formCategory ??= editing?.category ?? categories[0];

    try {
        const data = await api(`/api/${resource}`);

        mainContent.innerHTML = `
            <h2>Διαχείριση: ${esc(config.title)}</h2>

            <form id="resource-form" class="resource-form">
                <h3>${editing ? 'Επεξεργασία καταχώρησης' : 'Νέα καταχώρηση'}</h3>
                ${config.derivedCategory ? `
                    <p class="form-note">Η κατηγορία προκύπτει από τις ημερομηνίες: μια
                    έκθεση χωρίς λήξη, ή με λήξη στο μέλλον, εμφανίζεται στις τρέχουσες.</p>
                ` : `
                    <label for="form-category">Κατηγορία</label>
                    <select id="form-category" name="category">
                        ${categories.map(key => `
                            <option value="${esc(key)}" ${key === formCategory ? 'selected' : ''}>
                                ${esc(config.categories[key])}
                            </option>
                        `).join('')}
                    </select>
                `}
                ${config.fields(formCategory).map(field => `
                    <label for="form-${esc(field.name)}">${esc(field.label)}</label>
                    <input type="${esc(field.type)}" id="form-${esc(field.name)}" name="${esc(field.name)}"
                           value="${esc(editing?.item?.[field.name] ?? '')}" ${field.required ? 'required' : ''}>
                `).join('')}
                <div class="form-actions">
                    <button type="submit">${editing ? 'Αποθήκευση' : 'Προσθήκη'}</button>
                    ${editing ? '<button type="button" id="cancel-edit">Ακύρωση</button>' : ''}
                </div>
                <p id="form-error" class="error" role="alert" hidden></p>
            </form>

            ${categories.map(key => `
                <section data-category="${esc(key)}">
                    <h3>${esc(config.categories[key])}</h3>
                    ${renderTable(config.columns(key), data[key] || [], 'Ενέργειες')}
                </section>
            `).join('')}
        `;

        wireManageForm(resource, data);
    } catch (error) {
        console.error(`Error loading ${resource}:`, error);
        showError(error.message);
    }
}

function wireManageForm(resource, data) {
    const form = document.getElementById('resource-form');
    const formError = document.getElementById('form-error');
    const categorySelect = document.getElementById('form-category');

    // Τα πεδία των συνδέσμων αλλάζουν ανάλογα με την κατηγορία, οπότε
    // ξαναχτίζουμε τη φόρμα με την επιλεγμένη κατηγορία. Στους πόρους που
    // παράγουν μόνοι τους κατηγορία δεν υπάρχει επιλογέας.
    categorySelect?.addEventListener('change', () => {
        formCategory = categorySelect.value;
        manageResource(resource);
    });

    document.getElementById('cancel-edit')?.addEventListener('click', () => {
        editing = null;
        formCategory = null;
        manageResource(resource);
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        formError.hidden = true;

        const payload = Object.fromEntries(new FormData(form).entries());
        try {
            if (editing) {
                await api(`/api/${resource}/${editing.item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            } else {
                await api(`/api/${resource}`, { method: 'POST', body: JSON.stringify(payload) });
            }
            editing = null;
            formCategory = null;
            manageResource(resource);
        } catch (error) {
            formError.textContent = error.message;
            formError.hidden = false;
        }
    });

    mainContent.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', async () => {
            const id = Number(button.dataset.id);
            const category = button.closest('section').dataset.category;
            const item = (data[category] || []).find(entry => Number(entry.id) === id);

            if (button.dataset.action === 'edit') {
                editing = { category, item };
                formCategory = category;
                manageResource(resource);
                return;
            }

            if (!confirm(`Διαγραφή της καταχώρησης «${item?.name ?? item?.title ?? id}»;`)) return;
            try {
                await api(`/api/${resource}/${id}`, { method: 'DELETE' });
                if (editing?.item?.id === id) {
                    editing = null;
                    formCategory = null;
                }
                manageResource(resource);
            } catch (error) {
                alert(error.message);
            }
        });
    });
}

/* ------------------------------- Σύνδεση ------------------------------- */

/** Αποθηκεύει (ή σβήνει) τη συνεδρία, ώστε να επιβιώνει ενός refresh. */
function saveSession() {
    try {
        if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        else sessionStorage.removeItem(SESSION_KEY);
    } catch {
        // Η αποθήκευση μπορεί να είναι απενεργοποιημένη (π.χ. ιδιωτική
        // περιήγηση). Η εφαρμογή δουλεύει κανονικά, απλώς χωρίς επαναφορά.
    }
}

/**
 * Επαναφέρει τη συνεδρία μετά από refresh. Το token επαληθεύεται στον server,
 * γιατί οι συνεδρίες ζουν στη μνήμη και χάνονται σε κάθε επανεκκίνησή του.
 */
async function restoreSession() {
    let stored;
    try {
        stored = sessionStorage.getItem(SESSION_KEY);
    } catch {
        return;
    }
    if (!stored) return;

    try {
        session = JSON.parse(stored);
        const me = await api('/api/me');
        session = { token: session.token, role: me.role, username: me.username };
    } catch {
        session = null;
    }
    saveSession();
}

async function login(event) {
    event.preventDefault();
    const loginError = document.getElementById('login-error');
    loginError.hidden = true;

    try {
        const result = await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            })
        });

        session = { token: result.token, role: result.role, username: result.username };
        saveSession();
        // Η οθόνη ξαναζωγραφίζεται με τις ενέργειες διαχείρισης.
        navigate('admin');
    } catch (error) {
        loginError.textContent = error.message;
        loginError.hidden = false;
    }
}

function logout({ render = true } = {}) {
    const token = session?.token;
    session = null;
    editing = null;
    formCategory = null;
    saveSession();

    if (token) {
        fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
            .catch(() => { /* η τοπική αποσύνδεση έχει ήδη γίνει */ });
    }
    if (render) route();
}

/* ------------------------- Σύνδεση των χειριστών ------------------------- */

// Ένας χειριστής για όλα τα κουμπιά πλοήγησης: αλλάζουν μόνο το hash και η
// απόδοση γίνεται κεντρικά στη route().
document.addEventListener('click', event => {
    const button = event.target.closest('[data-nav]');

    if (!button) {
        // Κλικ εκτός του πάνελ το κλείνει. Κλικ μέσα του, π.χ. σε πεδίο της
        // φόρμας σύνδεσης, πρέπει να το αφήνει ανοιχτό.
        if (!event.target.closest('.submenu')) closeSubmenu();
        return;
    }

    const path = button.dataset.nav;

    // Συγκεκριμένη επιλογή: πλοηγούμαστε και κλείνουμε.
    if (path.includes('/')) {
        navigate(path);
        closeSubmenu();
        return;
    }

    // Το κουμπί ενότητας μόνο αποκαλύπτει τις επιλογές· η πλοήγηση γίνεται από
    // αυτές, όπου η πρώτη είναι πάντα το "Όλα". Εξαίρεση η διαχείριση, που δεν
    // έχει επιλογές: εκεί το κουμπί πρέπει να πλοηγεί, αλλιώς δεν φτάνει κανείς.
    if (!document.getElementById(`${path}-menu`)) {
        clearTimeout(hoverTimer);
        closeSubmenu();
        navigate(path);
        return;
    }

    // Με ποντίκι το πάνελ είναι ήδη ανοιχτό από το hover, οπότε το κλικ δεν
    // έχει τι να κάνει. Το detail είναι 0 όταν το κουμπί ενεργοποιείται από
    // πληκτρολόγιο: εκεί, όπως και στην αφή, το κλικ ανοίγει και κλείνει.
    if (hoverCapable && event.detail > 0) return;

    if (openMenu === path) {
        closeSubmenu();
        return;
    }
    openSubmenu(path);
});

/*
 * Το hover δεν πλοηγεί, μόνο δείχνει τις επιλογές: η αλλαγή σελίδας επειδή
 * πέρασε από πάνω ο κέρσορας θα ήταν ενοχλητική. Οι μικρές καθυστερήσεις
 * αποτρέπουν το ανοιγοκλείσιμο όταν ο κέρσορας απλώς διασχίζει τη μπάρα, και
 * δίνουν χρόνο να φτάσει από το κουμπί στο πάνελ.
 */
if (hoverCapable) {
    document.querySelectorAll('.menu-item').forEach(item => {
        const toggle = item.querySelector('[aria-controls]');

        item.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimer);
            // Η διαχείριση δεν έχει επιλογές: το πέρασμα από πάνω της κλείνει
            // ό,τι είχε ανοίξει δίπλα.
            hoverTimer = setTimeout(
                () => (toggle ? openSubmenu(toggle.dataset.nav) : closeSubmenu()),
                toggle ? 120 : 220
            );
        });

        item.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => closeSubmenu(), 220);
        });
    });
}

document.addEventListener('keydown', event => {
    // Το Escape κλείνει πρώτα το lightbox· αν δεν είναι ανοιχτό, τις επιλογές.
    if (event.key === 'Escape' && lightbox.hidden) closeSubmenu({ restoreFocus: true });
});

window.addEventListener('hashchange', route);

document.getElementById('footer-year').textContent = new Date().getFullYear();

// Πρώτα επαναφέρουμε τη συνεδρία, ώστε μια διεύθυνση όπως #/admin/links να
// ξέρει ήδη αν ο χρήστης έχει δικαιώματα διαχειριστή.
restoreSession().finally(route);
