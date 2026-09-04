/* ================================================================
 * Διαδικτυακή Εφαρμογή Ευγένιου Ντελακρουά — client-side κώδικας
 * ================================================================ */

const mainContent = document.getElementById('main-content');

// Τρέχουσα συνεδρία: { token, role, username } ή null όταν δεν υπάρχει σύνδεση.
let session = null;

// Το ενεργό στοιχείο του κύριου μενού. Το κρατάμε ώστε μια αποσύνδεση να
// ξαναζωγραφίζει αυτό που έβλεπε ο χρήστης, όχι πάντα την οθόνη διαχείρισης.
let currentMenu = null;

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

/* --------------------------- Πλοήγηση μενού --------------------------- */

function selectMenu(menu) {
    currentMenu = menu;
    document.querySelectorAll('.submenu').forEach(submenu => submenu.classList.add('hidden'));
    document.getElementById(`${menu}-menu`)?.classList.remove('hidden');
    updateMainContent(menu);
}

function updateMainContent(menu) {
    if (menu === 'bio') {
        mainContent.innerHTML = '<h2>Βιογραφία</h2><p>Επιλέξτε κατηγορία βιογραφίας από το πλαϊνό μενού.</p>';
    } else if (menu === 'paintings') {
        showPaintings('all');
    } else if (menu === 'exhibitions') {
        showExhibitions('current');
    } else if (menu === 'links') {
        showLinks('web_links');
    } else if (menu === 'admin') {
        mainContent.innerHTML = session
            ? `<h2>Διαχείριση</h2><p>Συνδεδεμένος ως <strong>${esc(session.username)}</strong>.</p>`
            : '<h2>Διαχείριση</h2><p>Εισάγετε στοιχεία διαχειριστή ή επισκέπτη.</p>';
    }
}

/* ------------------------------ Βιογραφία ------------------------------ */


// Το κείμενο της βιογραφίας ζει στο data/biography.json, όπως και τα υπόλοιπα
// δεδομένα. Το κρατάμε στη μνήμη μετά την πρώτη φόρτωση.
let biography = null;

async function loadBiography() {
    biography ??= await api('/api/biography');
    return biography;
}

async function showBiographySection(section) {
    try {
        const entry = (await loadBiography())[section];
        if (!entry) return;
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

async function showPaintings(category) {
    try {
        const data = await api('/api/paintings');

        const paintings = category === 'all'
            ? Object.values(data).flat()
            : data[category] || [];

        mainContent.innerHTML = `
            <h2>${esc(PAINTING_TITLES[category] || PAINTING_TITLES.all)}</h2>
            <div class="paintings-grid">
                ${paintings.map(painting => `
                    <figure class="painting-card">
                        <img src="images/${encodeURIComponent(painting.image)}" alt="${esc(painting.title)}" loading="lazy">
                        <figcaption>${esc(painting.title)}</figcaption>
                    </figure>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading paintings:', error);
        showError('Σφάλμα κατά τη φόρτωση των πινάκων.');
    }
}

/* --------------------- Εκθέσεις & Σύνδεσμοι (προβολή) --------------------- */

/**
 * Ρυθμίσεις ανά πόρο: κατηγορίες, στήλες πίνακα και πεδία φόρμας.
 * Χρησιμοποιούνται τόσο στην απλή προβολή όσο και στη διαχείριση,
 * ώστε ο ίδιος κώδικας να καλύπτει εκθέσεις και συνδέσμους.
 */
const RESOURCES = {
    paintings: {
        title: 'Πίνακες',
        categories: { landscapes: 'Τοπία', portraits: 'Πορτρέτα' },
        columns: () => [
            { key: 'title', label: 'Τίτλος' },
            { key: 'image', label: 'Αρχείο εικόνας' }
        ],
        fields: () => [
            { name: 'title', label: 'Τίτλος', type: 'text' },
            { name: 'image', label: 'Αρχείο εικόνας (μέσα στο public/images/)', type: 'text' }
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
            { name: 'name', label: 'Όνομα', type: 'text' },
            { name: 'location', label: 'Τοποθεσία', type: 'text' },
            { name: 'date', label: 'Ημερομηνία', type: 'date' }
        ]
    },
    links: {
        title: 'Σύνδεσμοι',
        categories: { web_links: 'Διαδικτυακοί Σύνδεσμοι', bibliography: 'Βιβλιογραφία' },
        columns: category => category === 'web_links'
            ? [{ key: 'name', label: 'Όνομα' }, { key: 'url', label: 'URL', type: 'link' }]
            : [{ key: 'name', label: 'Τίτλος' }, { key: 'author', label: 'Συγγραφέας' }],
        fields: category => category === 'web_links'
            ? [{ name: 'name', label: 'Όνομα', type: 'text' }, { name: 'url', label: 'URL', type: 'url' }]
            : [{ name: 'name', label: 'Τίτλος', type: 'text' }, { name: 'author', label: 'Συγγραφέας', type: 'text' }]
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
    try {
        const data = await api(`/api/${resource}`);
        mainContent.innerHTML = `
            <h2>${esc(config.categories[category])}</h2>
            ${renderTable(config.columns(category), data[category] || [])}
        `;
    } catch (error) {
        console.error(`Error loading ${resource}:`, error);
        showError('Σφάλμα κατά τη φόρτωση των δεδομένων.');
    }
}

const showExhibitions = category => showResource('exhibitions', category);
const showLinks = category => showResource('links', category);

/* --------------------------- Διαχείριση (CRUD) --------------------------- */

// Ποια εγγραφή επεξεργαζόμαστε αυτή τη στιγμή (null = προσθήκη νέας).
let editing = null;
// Η κατηγορία που είναι επιλεγμένη στη φόρμα (καθορίζει ποια πεδία εμφανίζονται).
let formCategory = null;

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
                           value="${esc(editing?.item?.[field.name] ?? '')}" required>
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
    let stored = null;
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
        currentMenu = 'admin';
        updateMainContent('admin');
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
    if (render) updateMainContent(currentMenu);
}

/* ------------------------- Σύνδεση των χειριστών ------------------------- */

document.querySelectorAll('[data-menu]').forEach(button =>
    button.addEventListener('click', () => selectMenu(button.dataset.menu)));

document.querySelectorAll('[data-bio]').forEach(button =>
    button.addEventListener('click', () => showBiographySection(button.dataset.bio)));

document.querySelectorAll('[data-paintings]').forEach(button =>
    button.addEventListener('click', () => showPaintings(button.dataset.paintings)));

document.querySelectorAll('[data-exhibitions]').forEach(button =>
    button.addEventListener('click', () => showExhibitions(button.dataset.exhibitions)));

document.querySelectorAll('[data-links]').forEach(button =>
    button.addEventListener('click', () => showLinks(button.dataset.links)));

document.querySelectorAll('[data-manage]').forEach(button =>
    button.addEventListener('click', () => {
        editing = null;
        formCategory = null;
        manageResource(button.dataset.manage);
    }));

document.getElementById('login-form').addEventListener('submit', login);
document.getElementById('logout-button').addEventListener('click', () => logout());

document.getElementById('footer-year').textContent = new Date().getFullYear();

applySession();
restoreSession();
