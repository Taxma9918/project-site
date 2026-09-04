const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILES = {
    exhibitions: path.join(PUBLIC_DIR, 'exhibitions.json'),
    links: path.join(PUBLIC_DIR, 'links.json')
};

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

// Ενεργές συνεδρίες: token -> { username, role }
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
    return token ? sessions.get(token) || null : null;
}

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
    sessions.set(token, { username: user.username, role: user.role });
    res.json({ success: true, token, role: user.role, username: user.username });
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
    await fs.writeFile(DATA_FILES[resource], JSON.stringify(data, null, 2) + '\n', 'utf8');
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
 * επαναλαμβάνεται ο ίδιος κώδικας για εκθέσεις και συνδέσμους.
 */
function registerResource(resource, { validate }) {
    const base = `/api/${resource}`;

    app.get(base, async (req, res, next) => {
        try {
            res.json(await readData(resource));
        } catch (error) {
            next(error);
        }
    });

    app.post(base, requireAdmin, async (req, res, next) => {
        try {
            const data = await readData(resource);
            const { category, ...fields } = req.body || {};

            if (!Object.prototype.hasOwnProperty.call(data, category)) {
                return res.status(400).json({ success: false, message: 'Άγνωστη κατηγορία.' });
            }
            const problem = validate(category, fields);
            if (problem) return res.status(400).json({ success: false, message: problem });

            const item = { id: nextId(data), ...fields };
            data[category].push(item);
            await writeData(resource, data);
            res.status(201).json({ success: true, item });
        } catch (error) {
            next(error);
        }
    });

    app.put(`${base}/:id`, requireAdmin, async (req, res, next) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            const data = await readData(resource);
            const found = findItem(data, id);
            if (!found) {
                return res.status(404).json({ success: false, message: 'Δεν βρέθηκε.' });
            }

            const { category = found.category, ...fields } = req.body || {};
            if (!Object.prototype.hasOwnProperty.call(data, category)) {
                return res.status(400).json({ success: false, message: 'Άγνωστη κατηγορία.' });
            }
            const problem = validate(category, fields);
            if (problem) return res.status(400).json({ success: false, message: problem });

            const item = { id, ...fields };
            if (category === found.category) {
                data[category][found.index] = item;
            } else {
                // Μετακίνηση σε άλλη κατηγορία (π.χ. τρέχουσα -> παρελθούσα έκθεση).
                data[found.category].splice(found.index, 1);
                data[category].push(item);
            }
            await writeData(resource, data);
            res.json({ success: true, item });
        } catch (error) {
            next(error);
        }
    });

    app.delete(`${base}/:id`, requireAdmin, async (req, res, next) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            const data = await readData(resource);
            const found = findItem(data, id);
            if (!found) {
                return res.status(404).json({ success: false, message: 'Δεν βρέθηκε.' });
            }
            data[found.category].splice(found.index, 1);
            await writeData(resource, data);
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    });
}

const nonEmpty = value => typeof value === 'string' && value.trim() !== '';

registerResource('exhibitions', {
    validate: (category, { name, location, date }) => {
        if (!nonEmpty(name)) return 'Το όνομα είναι υποχρεωτικό.';
        if (!nonEmpty(location)) return 'Η τοποθεσία είναι υποχρεωτική.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'Η ημερομηνία πρέπει να έχει μορφή ΕΕΕΕ-ΜΜ-ΗΗ.';
        return null;
    }
});

registerResource('links', {
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

app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ success: false, message: 'Σφάλμα διακομιστή.' });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
