const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Τα στατικά αρχεία και τα δεδομένα ζουν χωριστά: ό,τι είναι μέσα στο public/
// σερβίρεται αυτούσιο, ενώ στο data/ φτάνει κανείς μόνο μέσα από το API.
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

const DATA_FILES = {
    paintings: path.join(DATA_DIR, 'paintings.json'),
    exhibitions: path.join(DATA_DIR, 'exhibitions.json'),
    links: path.join(DATA_DIR, 'links.json')
};

const BIOGRAPHY_FILE = path.join(DATA_DIR, 'biography.json');

// Διάρκεια ζωής μιας συνεδρίας χωρίς δραστηριότητα.
const SESSION_TTL_MS = 30 * 60 * 1000;

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

/* ---------------------------------------------------------------- *
 * Χρήστες / Αυθεντικοποίηση
 * Οι κωδικοί αποθηκεύονται ως scrypt hashes, ποτέ σε καθαρό κείμενο.
 * Προεπιλεγμένα διαπιστευτήρια: admin/1234 και user/user1234
 * ---------------------------------------------------------------- */
const users = [
    {
        username: 'admin',
        role: 'admin',
        salt: 'd2e8c097d31218e60af06cbb7a76692d',
        hash: 'c920610245a5f29f9cd11226646f8597bedf60bed07acec70ff787688637f3e80cf907244d6a4504ccd55e9c1dc36ec6d4dacab96cdbcbbf69e230a9daf0a9c0'
    },
    {
        username: 'user',
        role: 'user',
        salt: '5fbe609765db75222871db89913d6132',
        hash: '07388df9c9ed4b95e67ddb1c5b4d707d6cc9d5b875853842737b7cb6eb0c6eb2648b3463389dc672b91ce680694c6b691fa0ff7a6b1c02f295bb434b0f6247a8'
    }
];

// Ενεργές συνεδρίες: token -> { username, role, expiresAt }
const sessions = new Map();

function verifyPassword(user, password) {
    const attempt = crypto.scryptSync(password, user.salt, 64);
    const stored = Buffer.from(user.hash, 'hex');
    // Σύγκριση σταθερού χρόνου, ώστε να μην διαρρέει πληροφορία μέσω timing.
    return attempt.length === stored.length && crypto.timingSafeEqual(attempt, stored);
}

function currentUser(req) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;

    const session = sessions.get(token);
    if (!session) return null;

    if (session.expiresAt <= Date.now()) {
        sessions.delete(token);
        return null;
    }

    // Κυλιόμενη λήξη: κάθε έγκυρο αίτημα ανανεώνει τον χρόνο ζωής της συνεδρίας.
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return session;
}

// Περιοδικός καθαρισμός, ώστε τα ληγμένα tokens να μη συσσωρεύονται στη μνήμη.
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) {
        if (session.expiresAt <= now) sessions.delete(token);
    }
}, SESSION_TTL_MS).unref();

function requireAdmin(req, res, next) {
    const user = currentUser(req);
    if (!user) {
        return res.status(401).json({ success: false, message: 'Απαιτείται σύνδεση.' });
    }
    if (user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Απαιτούνται δικαιώματα διαχειριστή.' });
    }
    req.user = user;
    next();
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = users.find(u => u.username === username);

    if (!user || typeof password !== 'string' || !verifyPassword(user, password)) {
        return res.status(401).json({ success: false, message: 'Λάθος όνομα χρήστη ή κωδικός.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
        username: user.username,
        role: user.role,
        expiresAt: Date.now() + SESSION_TTL_MS
    });
    res.json({ success: true, token, role: user.role, username: user.username });
});

// Επαληθεύει ένα αποθηκευμένο token. Ο client το καλεί μετά από refresh, γιατί
// οι συνεδρίες ζουν στη μνήμη και χάνονται σε κάθε επανεκκίνηση του server.
app.get('/api/me', (req, res) => {
    const user = currentUser(req);
    if (!user) {
        return res.status(401).json({ success: false, message: 'Απαιτείται σύνδεση.' });
    }
    res.json({ success: true, username: user.username, role: user.role });
});

app.post('/api/logout', (req, res) => {
    const header = req.get('authorization') || '';
    if (header.startsWith('Bearer ')) sessions.delete(header.slice(7));
    res.json({ success: true });
});

/* ---------------------------------------------------------------- *
 * Βοηθητικές συναρτήσεις για τα αρχεία δεδομένων
 * Δομή: { "<κατηγορία>": [ { id, ... }, ... ], ... }
 * ---------------------------------------------------------------- */
async function readData(resource) {
    return JSON.parse(await fs.readFile(DATA_FILES[resource], 'utf8'));
}

async function writeData(resource, data) {
    const target = DATA_FILES[resource];
    const temp = `${target}.tmp`;
    // Γράφουμε πρώτα σε προσωρινό αρχείο και μετά το μετονομάζουμε: η rename
    // είναι ατομική, οπότε μια διακοπή στη μέση δεν αφήνει χαλασμένο JSON.
    await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    await fs.rename(temp, target);
}

/**
 * Σειριοποιεί τις εγγραφές ανά πόρο. Κάθε mutating endpoint κάνει
 * read-modify-write: αν δύο έτρεχαν παράλληλα, η δεύτερη εγγραφή θα έσβηνε
 * την αλλαγή της πρώτης.
 */
const writeQueues = new Map();

function withLock(resource, task) {
    const previous = writeQueues.get(resource) || Promise.resolve();
    const next = previous.then(task, task);
    writeQueues.set(resource, next.catch(() => { /* το σφάλμα το χειρίζεται ο caller */ }));
    return next;
}

function allItems(data) {
    return Object.values(data).flat();
}

function nextId(data) {
    return allItems(data).reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function findItem(data, id) {
    for (const [category, items] of Object.entries(data)) {
        const index = items.findIndex(item => Number(item.id) === id);
        if (index !== -1) return { category, index };
    }
    return null;
}

/**
 * Δημιουργεί τα CRUD endpoints για έναν πόρο, ώστε να μην
 * επαναλαμβάνεται ο ίδιος κώδικας για πίνακες, εκθέσεις και συνδέσμους.
 */
function registerResource(resource, { fields, validate }) {
    const base = `/api/${resource}`;

    /**
     * Κρατά μόνο τα επιτρεπόμενα πεδία της κατηγορίας. Έτσι ο client δεν μπορεί
     * ούτε να γράψει αυθαίρετα κλειδιά στο JSON, ούτε να πλαστογραφήσει το id
     * στέλνοντάς το μέσα στο σώμα του αιτήματος.
     */
    function sanitize(category, body) {
        const result = {};
        for (const key of fields(category)) {
            if (typeof body[key] === 'string') result[key] = body[key].trim();
        }
        return result;
    }

    app.get(base, async (req, res, next) => {
        try {
            res.json(await readData(resource));
        } catch (error) {
            next(error);
        }
    });

    app.post(base, requireAdmin, async (req, res, next) => {
        try {
            await withLock(resource, async () => {
                const body = req.body || {};
                const data = await readData(resource);

                if (!Object.prototype.hasOwnProperty.call(data, body.category)) {
                    return res.status(400).json({ success: false, message: 'Άγνωστη κατηγορία.' });
                }
                const values = sanitize(body.category, body);
                const problem = validate(body.category, values);
                if (problem) return res.status(400).json({ success: false, message: problem });

                const item = { id: nextId(data), ...values };
                data[body.category].push(item);
                await writeData(resource, data);
                res.status(201).json({ success: true, item });
            });
        } catch (error) {
            next(error);
        }
    });

    app.put(`${base}/:id`, requireAdmin, async (req, res, next) => {
        try {
            await withLock(resource, async () => {
                const body = req.body || {};
                const id = Number.parseInt(req.params.id, 10);
                const data = await readData(resource);
                const found = findItem(data, id);
                if (!found) {
                    return res.status(404).json({ success: false, message: 'Δεν βρέθηκε.' });
                }

                const category = body.category ?? found.category;
                if (!Object.prototype.hasOwnProperty.call(data, category)) {
                    return res.status(400).json({ success: false, message: 'Άγνωστη κατηγορία.' });
                }
                const values = sanitize(category, body);
                const problem = validate(category, values);
                if (problem) return res.status(400).json({ success: false, message: problem });

                const item = { id, ...values };
                if (category === found.category) {
                    data[category][found.index] = item;
                } else {
                    // Μετακίνηση σε άλλη κατηγορία (π.χ. τρέχουσα -> παρελθούσα έκθεση).
                    data[found.category].splice(found.index, 1);
                    data[category].push(item);
                }
                await writeData(resource, data);
                res.json({ success: true, item });
            });
        } catch (error) {
            next(error);
        }
    });

    app.delete(`${base}/:id`, requireAdmin, async (req, res, next) => {
        try {
            await withLock(resource, async () => {
                const id = Number.parseInt(req.params.id, 10);
                const data = await readData(resource);
                const found = findItem(data, id);
                if (!found) {
                    return res.status(404).json({ success: false, message: 'Δεν βρέθηκε.' });
                }
                data[found.category].splice(found.index, 1);
                await writeData(resource, data);
                res.json({ success: true });
            });
        } catch (error) {
            next(error);
        }
    });
}

const nonEmpty = value => typeof value === 'string' && value.trim() !== '';

// Το πεδίο image είναι όνομα αρχείου μέσα στο public/images/, όχι διαδρομή:
// απορρίπτουμε καθετάκια και ".." ώστε να μη δείχνει κανείς έξω από τον φάκελο.
const IMAGE_FILENAME = /^[^/\\]+\.(?:jpe?g|png|webp|gif)$/i;

registerResource('paintings', {
    fields: () => ['title', 'image'],
    validate: (category, { title, image }) => {
        if (!nonEmpty(title)) return 'Ο τίτλος είναι υποχρεωτικός.';
        if (!IMAGE_FILENAME.test(image || '') || image.includes('..')) {
            return 'Η εικόνα πρέπει να είναι όνομα αρχείου (.jpg, .png, .webp ή .gif) μέσα στο public/images/.';
        }
        return null;
    }
});

registerResource('exhibitions', {
    fields: () => ['name', 'location', 'date'],
    validate: (category, { name, location, date }) => {
        if (!nonEmpty(name)) return 'Το όνομα είναι υποχρεωτικό.';
        if (!nonEmpty(location)) return 'Η τοποθεσία είναι υποχρεωτική.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'Η ημερομηνία πρέπει να έχει μορφή ΕΕΕΕ-ΜΜ-ΗΗ.';
        return null;
    }
});

registerResource('links', {
    fields: category => (category === 'web_links' ? ['name', 'url'] : ['name', 'author']),
    validate: (category, { name, url, author }) => {
        if (!nonEmpty(name)) return 'Το όνομα/τίτλος είναι υποχρεωτικό.';
        if (category === 'web_links') {
            if (!/^https?:\/\/\S+$/.test(url || '')) return 'Το URL πρέπει να ξεκινά με http:// ή https://.';
        } else if (!nonEmpty(author)) {
            return 'Ο συγγραφέας είναι υποχρεωτικός.';
        }
        return null;
    }
});

// Η βιογραφία είναι στατικό κείμενο και δεν έχει κατηγορίες με εγγραφές, οπότε
// δεν περνά από το registerResource: εκτίθεται μόνο για ανάγνωση.
app.get('/api/biography', async (req, res, next) => {
    try {
        res.json(JSON.parse(await fs.readFile(BIOGRAPHY_FILE, 'utf8')));
    } catch (error) {
        next(error);
    }
});

// Άγνωστη διαδρομή κάτω από το /api: απαντάμε με JSON και όχι με τη σελίδα
// σφάλματος του express, ώστε ο client να μπορεί πάντα να κάνει response.json().
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, message: 'Άγνωστο endpoint.' });
});

app.use((error, req, res, next) => {
    // Τα σφάλματα του express.json() (χαλασμένο JSON, υπερμεγέθες σώμα) φέρουν
    // δικό τους status 4xx. Το σεβόμαστε, ώστε ο client να ξεχωρίζει το «έστειλα
    // κακά δεδομένα» από το «χάλασε ο διακομιστής».
    const status = error.status || error.statusCode;
    if (status >= 400 && status < 500) {
        return res.status(status).json({
            success: false,
            message: error.type === 'entity.too.large'
                ? 'Το αίτημα είναι υπερβολικά μεγάλο.'
                : 'Μη έγκυρα δεδομένα στο αίτημα.'
        });
    }
    console.error(error);
    res.status(500).json({ success: false, message: 'Σφάλμα διακομιστή.' });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
