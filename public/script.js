/* ================================================================
 * Διαδικτυακή Εφαρμογή Ευγένιου Ντελακρουά — client-side κώδικας
 * ================================================================ */

const mainContent = document.getElementById('main-content');

// Τρέχουσα συνεδρία: { token, role, username } ή null όταν δεν υπάρχει σύνδεση.
let session = null;

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
        if (response.status === 401) logout();
        throw new Error(data.message || `Σφάλμα ${response.status}`);
    }
    return data;
}

function showError(message) {
    mainContent.innerHTML = `<p class="error">${esc(message)}</p>`;
}

/* --------------------------- Πλοήγηση μενού --------------------------- */

function selectMenu(menu) {
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

const BIOGRAPHY = {
    birth: {
        title: 'Γέννηση',
        paragraphs: [
            'Γεννήθηκε στις 26 Απριλίου 1798 στο Σαρεντόν-Σαιν-Μορίς (Charenton-Saint Maurice) κοντά στο Παρίσι και ήταν το τέταρτο παιδί του Σαρλ Ντελακρουά, υπουργού Εξωτερικών του Διευθυντηρίου, αν και εικάζεται ότι ο πραγματικός του πατέρας ήταν ο Ταλλεϋράνδος, διάσημος διπλωμάτης στον οποίο ο Ευγένιος έμοιαζε στην εμφάνιση και τον χαρακτήρα. Ο Σαρλ Ντελακρουά πέθανε το 1805 και η μητέρα του το 1814, αφήνοντας τον Ευγένιο ορφανό στην ηλικία των 16.',
            'Το 1815 μαθήτευσε κοντά στον ζωγράφο Πιερ-Ναρσίς Γκερέν και το 1816 μπήκε στη Σχολή Καλών Τεχνών. Το 1822 παρουσίασε στο Σαλόνι Παρισιού τον πίνακά του «Η βάρκα του Δάντη». Το 1824 παρουσίασε τη «Σφαγή της Χίου», εμπνευσμένος από το πραγματικό γεγονός της Ελληνικής επανάστασης, και ο πίνακας αγοράστηκε από τη Γαλλική κυβέρνηση για 6000 νομίσματα.',
            'Εντυπωσιασμένος από τις τεχνικές των Άγγλων ζωγράφων όπως ο Τζον Κόνσταμπλ, ταξίδεψε το 1825 στην Αγγλία όπου επισκέφθηκε πολλές γκαλερί και θέατρα και επηρεάστηκε από τον αγγλικό πολιτισμό. Επίσης έκανε την εικονογράφηση μιας Γαλλικής έκδοσης του Φάουστ με 17 λιθογραφίες, καθώς και διάφορων έργων του Ουίλλιαμ Σαίξπηρ και του Σερ Ουόλτερ Σκοτ.'
        ]
    },
    career: {
        title: 'Έργα',
        paragraphs: [
            'Μεταξύ 1827 και 1832 παρουσίασε πολλά μεγάλα έργα με ιστορικά θέματα. Το 1827 παρουσίασε στο Σαλόνι τον «Θάνατο του Σαρδανάπαλου», εμπνευσμένο από την ποίηση του Λόρδου Μπάυρον. Εντυπωσίασε και πάλι το κοινό με το σημαντικότερο και τελευταίο ρομαντικό έργο του, «Η Ελευθερία οδηγεί τον Λαό», εμπνευσμένο από την Ιουλιανή επανάσταση του 1830. Ο πίνακας αγοράστηκε και αυτός από τη Γαλλική κυβέρνηση, αλλά χάρη στην αντίδραση κάποιων αξιωματούχων που θεωρούσαν την προώθηση της ιδέας της ελευθερίας ανατρεπτική, αποσύρθηκε από την κοινή θέα. Παρόλα αυτά, ο Ντελακρουά πήρε αρκετές εργολαβίες για τοιχογραφίες σε δημόσια κτίρια.',
            'Το 1832 ταξίδεψε για 6 μήνες στο Μαρόκο, όπου ο αρχαίος και εξωτικός πολιτισμός των Αράβων τον ενέπνευσε εκ νέου στη δημιουργία έργων όπως «Οι Φανατικοί της Ταγγέρης» (1837-1838), «Ο Σουλτάνος του Μαρόκου και η Ακολουθία του» (1845), «Κυνήγι Λιονταριών» (1854) και «Άραβας Σελώνοντας το Άλογό του» (1855). Οι «Γυναίκες του Αλγερίου» έκαναν μεγάλη επιτυχία στο Σαλόνι του 1834. Το 1833 ζωγράφισε τις τοιχογραφίες στο βασιλικό δωμάτιο του παλατιού των Βουρβόνων και συνέχισε με διάφορα έργα για το Λούβρο και το Ιστορικό Μουσείο στις Βερσαλλίες, μέχρι το 1861. Μετά τη Γαλλική Επανάσταση του 1848, ο Ναπολέων Γ΄ επέτρεψε τη δημόσια εμφάνιση του έργου «Η Ελευθερία οδηγεί τον λαό», το οποίο σήμερα εκτίθεται στο μουσείο του Λούβρου.',
            'Άλλα έργα του είναι «Το Ναυάγιο του Δον Χουάν», «Η Μήδεια πριν σκοτώσει τα παιδιά της», «Η είσοδος των Σταυροφόρων στην Κωνσταντινούπολη» και ένα πορτρέτο του συνθέτη Φρεντερίκ Σοπέν. Έργα του εμπνευσμένα από την Ελληνική επανάσταση είναι «Η Σφαγή της Χίου», «Έφιππος Έλληνας αγωνιστής», «Η Ελλάδα στα ερείπια του Μεσολογγίου» και «Η Μάχη του Γκιαούρη με τον Πασά».',
            'Το 1855 εξέθεσε 48 πίνακες στη Διεθνή Έκθεση Παρισιού και έγινε δεκτός στην Ακαδημία μετά από την όγδοη αίτησή του. Κάνοντας τοιχογραφίες πολλές ώρες όρθιος επάνω σε σκαλωσιές μισοτελειωμένων κτιρίων, αρρώστησε και αποσύρθηκε. Πέθανε στις 13 Αυγούστου 1863 στο Παρίσι.'
        ]
    }
};

function showBiographySection(section) {
    const entry = BIOGRAPHY[section];
    if (!entry) return;
    mainContent.innerHTML = `
        <h2>${esc(entry.title)}</h2>
        ${entry.paragraphs.map(text => `<p>${esc(text)}</p>`).join('')}
    `;
}

/* ------------------------------- Πίνακες ------------------------------- */

const PAINTING_TITLES = {
    all: 'Οι Πίνακες του Ντελακρουά',
    landscapes: 'Τοπία του Ντελακρουά',
    portraits: 'Πορτρέτα του Ντελακρουά'
};

async function showPaintings(category) {
    try {
        const response = await fetch('paintings.json');
        if (!response.ok) throw new Error('Δεν ήταν δυνατή η φόρτωση των πινάκων.');
        const data = await response.json();

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

            if (!confirm(`Διαγραφή της καταχώρησης «${item?.name ?? id}»;`)) return;
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
        document.getElementById('login-form').reset();
        applySession();
        updateMainContent('admin');
    } catch (error) {
        loginError.textContent = error.message;
        loginError.hidden = false;
    }
}

function logout() {
    const token = session?.token;
    session = null;
    editing = null;
    formCategory = null;
    applySession();

    if (token) {
        fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
            .catch(() => { /* η τοπική αποσύνδεση έχει ήδη γίνει */ });
    }
    updateMainContent('admin');
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
document.getElementById('logout-button').addEventListener('click', logout);

applySession();
