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

const DEFAULT_CATEGORY = {
    paintings: 'all',
    exhibitions: 'current',
    links: 'web_links'
};

function navigate(path) {
    const target = `#/${path}`;
    // Αν το hash δεν αλλάζει, το hashchange δεν πυροδοτείται: ζωγραφίζουμε εμείς.
    if (location.hash === target) route();
    else location.hash = target;
}

function showSubmenu(menu) {
    document.querySelectorAll('.submenu').forEach(submenu => submenu.classList.add('hidden'));
    if (menu) document.getElementById(`${menu}-menu`)?.classList.remove('hidden');
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
        showSubmenu(null);
        markActive(null, '');
        mainContent.innerHTML = '<p>Καλωσορίσατε! Επιλέξτε μια επιλογή από το μενού.</p>';
        return;
    }

    showSubmenu(menu);
    markActive(menu, path);

    try {
        if (menu === 'admin') await showAdmin(category);
        else if (menu === 'bio') await showBiographySection(category);
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
    if (!section) {
        mainContent.innerHTML = '<h2>Βιογραφία</h2><p>Επιλέξτε κατηγορία βιογραφίας από το πλαϊνό μενού.</p>';
        return;
    }
    if (!biography) showLoading();
    try {
        const entry = (await loadBiography())[section];
        if (!entry) {
            showError('Η ενότητα βιογραφίας δεν βρέθηκε.');
            return;
        }
        mainContent.innerHTML = `
            <h2>${esc(entry.title)}</h2>
            ${entry.paragraphs.map(text => `<p>${esc(text)}</p>`).join('')}
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
        categories: { current: 'Τρέχουσες Εκθέσεις', past: 'Παρελθούσες Εκθέσεις' },
        columns: () => [
            { key: 'name', label: 'Όνομα' },
            { key: 'location', label: 'Τοποθεσία' },
            { key: 'date', label: 'Ημερομηνία' }
        ],
        fields: () => [
            { name: 'name', label: 'Όνομα', type: 'text', required: true },
            { name: 'location', label: 'Τοποθεσία', type: 'text', required: true },
            { name: 'date', label: 'Ημερομηνία', type: 'date', required: true }
        ]
    },
    links: {
        title: 'Σύνδεσμοι',
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
    return esc(value);
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
    if (!config?.categories[category]) {
        showError('Η κατηγορία δεν βρέθηκε.');
        return;
    }
    showLoading();
    try {
        const data = await api(`/api/${resource}`);
        const items = data[category] || [];
        mainContent.innerHTML = `
            <h2>${esc(config.categories[category])}</h2>
            ${items.length ? renderFilter('Αναζήτηση στις καταχωρήσεις…') : ''}
            ${renderTable(config.columns(category), items)}
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
        if (!RESOURCES[resource]) {
            showError('Άγνωστη ενότητα διαχείρισης.');
            return;
        }
        if (session?.role !== 'admin') {
            // Χωρίς δικαιώματα δεν έχει νόημα η οθόνη: πίσω στη σύνδεση.
            navigate('admin');
            return;
        }
        await manageResource(resource);
        return;
    }

    editing = null;
    formCategory = null;
    mainContent.innerHTML = session
        ? `<h2>Διαχείριση</h2><p>Συνδεδεμένος ως <strong>${esc(session.username)}</strong>.</p>`
        : '<h2>Διαχείριση</h2><p>Εισάγετε στοιχεία διαχειριστή ή επισκέπτη.</p>';
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
                <label for="form-category">Κατηγορία</label>
                <select id="form-category" name="category">
                    ${categories.map(key => `
                        <option value="${esc(key)}" ${key === formCategory ? 'selected' : ''}>
                            ${esc(config.categories[key])}
                        </option>
                    `).join('')}
                </select>
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
    // ξαναχτίζουμε τη φόρμα με την επιλεγμένη κατηγορία.
    categorySelect.addEventListener('change', () => {
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

function applySession() {
    const loggedIn = Boolean(session);
    document.getElementById('login-section').classList.toggle('hidden', loggedIn);
    document.getElementById('session-section').classList.toggle('hidden', !loggedIn);
    document.getElementById('admin-actions').classList.toggle('hidden', session?.role !== 'admin');
    document.getElementById('session-name').textContent = session?.username ?? '';
}

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
    applySession();
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
        document.getElementById('login-form').reset();
        applySession();
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
    applySession();

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
    if (button) navigate(button.dataset.nav);
});

document.getElementById('login-form').addEventListener('submit', login);
document.getElementById('logout-button').addEventListener('click', () => logout());

window.addEventListener('hashchange', route);

document.getElementById('footer-year').textContent = new Date().getFullYear();

applySession();
// Πρώτα επαναφέρουμε τη συνεδρία, ώστε μια διεύθυνση όπως #/admin/links να
// ξέρει ήδη αν ο χρήστης έχει δικαιώματα διαχειριστή.
restoreSession().finally(route);
