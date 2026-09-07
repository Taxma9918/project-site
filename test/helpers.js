/**
 * Κοινή υποδομή για τα tests.
 *
 * Κάθε test file σηκώνει δικό του αντίγραφο της εφαρμογής πάνω σε προσωρινό
 * φάκελο δεδομένων, ώστε οι εγγραφές να μην αγγίζουν τα πραγματικά JSON και
 * τα αρχεία να μπορούν να τρέχουν ανεξάρτητα.
 */
const { cpSync, mkdtempSync, rmSync } = require('node:fs');
const { once } = require('node:events');
const os = require('node:os');
const path = require('node:path');

async function startTestServer() {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'delacroix-test-'));
    cpSync(path.join(__dirname, '..', 'data'), dataDir, { recursive: true });

    // Πρέπει να οριστεί πριν φορτωθεί ο server, γιατί το DATA_DIR διαβάζεται
    // μία φορά, όταν αποτιμάται το module.
    process.env.DATA_DIR = dataDir;

    const app = require('../server.js');
    const server = app.listen(0);
    await once(server, 'listening');
    const { port } = server.address();

    /** Στέλνει αίτημα και επιστρέφει status μαζί με το σώμα σε JSON. */
    async function request(method, endpoint, { token, body } = {}) {
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
            method,
            headers,
            // Το body μπορεί να είναι έτοιμο string, ώστε να δοκιμάζεται και χαλασμένο JSON.
            body: typeof body === 'string' ? body : body && JSON.stringify(body)
        });
        const data = await response.json().catch(() => null);
        return { status: response.status, data, headers: response.headers };
    }

    async function loginAs(username, password) {
        const { data } = await request('POST', '/api/login', { body: { username, password } });
        return data.token;
    }

    async function close() {
        server.close();
        await once(server, 'close');
        rmSync(dataDir, { recursive: true, force: true });
    }

    return { request, loginAs, close, port, dataDir };
}

module.exports = { startTestServer };
