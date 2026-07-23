const express = require('express');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const helmet = require('helmet'); // Helmet ko import karein
const sqlite3 = require('sqlite3').verbose();
const { exec } = require('child_process');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Environment variables ko load karein

const app = express();
const port = Number(process.env.PORT) || 3000;

// --- Security Best Practice: Use Helmet ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https://upload.wikimedia.org'],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: null
        }
    }
})); // Security headers ke liye

const DB_PATH_SQL = path.join(__dirname, 'database.sqlite');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const LEGACY_DB_PATH = path.join(__dirname, 'db.json');
const LEGACY_AUTH_PATH = path.join(__dirname, 'auth.json');
const RESET_EMAIL = process.env.RESET_EMAIL || 'shamneetmaliyan123456@gmail.com';

const defaultContactDetails = {
    primaryEmail: 'ce@iriroorkee.res.in',
    secondaryEmail: 'info@iriroorkee.res.in',
    phoneDisplay: '+91-1332-265174',
    phoneLink: '+911332265174',
    address: 'Irrigation Research Institute, Roorkee, Uttarakhand',
    fax: '+91 - 1332 - 262487',
    contactTitle: 'An ISO 9001: 2008 Certified Organization',
    directorTitle: 'Chief Engineer (Design) & Director',
    queryText: 'For any Information/Query related to Hydraulic Model Study/Testing etc.'
};

// --- Database Setup ---
const db = new sqlite3.Database(DB_PATH_SQL, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        process.exit(1);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDb();
    }
});

function initializeDb() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS key_value (key TEXT PRIMARY KEY, value TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, date TEXT NOT NULL, updatedAt TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS tenders (id INTEGER PRIMARY KEY, publishDate TEXT, startDate TEXT, endDate TEXT, refNo TEXT, description TEXT, officeDetail TEXT, openLink TEXT, date TEXT, updatedAt TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS menu_content (key TEXT PRIMARY KEY, label TEXT, content TEXT, images TEXT, pdfs TEXT, updatedAt TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS auth (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL)`);

        // Check for migration from JSON files
        if (fs.existsSync(LEGACY_DB_PATH) || fs.existsSync(LEGACY_AUTH_PATH)) {
            console.log('Found old JSON database. Attempting to migrate to SQLite...');
            migrateDataFromJsons();
        } else {
            // Ensure default admin exists if auth table is empty
            db.get('SELECT COUNT(*) as count FROM auth', (err, row) => {
                if (row && row.count === 0) {
                    const defaultUser = process.env.ADMIN_USERNAME || 'admin';
                    const defaultPass = process.env.ADMIN_PASSWORD || 'password123';
                    db.run('INSERT INTO auth (username, password) VALUES (?, ?)', [defaultUser, defaultPass], (err) => {
                        if (!err) console.log('Inserted default admin user.');
                    });
                }
            });
        }
    });
}

function migrateDataFromJsons() {
    // Helper functions for migration, copied from original file
    function normalizeData(data = {}) {
        return {
            updates: typeof data.updates === 'string' ? data.updates : '',
            announcements: Array.isArray(data.announcements) ? data.announcements : [],
            tenders: Array.isArray(data.tenders) ? data.tenders : [],
            menuContent: data.menuContent && typeof data.menuContent === 'object' && !Array.isArray(data.menuContent) ? data.menuContent : {},
            contactDetails: data.contactDetails && typeof data.contactDetails === 'object' && !Array.isArray(data.contactDetails) ? { ...defaultContactDetails, ...data.contactDetails } : { ...defaultContactDetails }
        };
    }
    function normalizeAuth(auth = {}) {
        return {
            username: typeof auth.username === 'string' && auth.username.trim() ? auth.username.trim() : process.env.ADMIN_USERNAME || 'admin',
            password: typeof auth.password === 'string' && auth.password ? auth.password : process.env.ADMIN_PASSWORD || 'password123'
        };
    }

    db.get('SELECT 1 FROM auth LIMIT 1', (err, row) => {
        if (row) {
            console.log('Data seems to be already migrated. Renaming old JSON files.');
            if (fs.existsSync(LEGACY_DB_PATH)) fs.renameSync(LEGACY_DB_PATH, LEGACY_DB_PATH + '.migrated');
            if (fs.existsSync(LEGACY_AUTH_PATH)) fs.renameSync(LEGACY_AUTH_PATH, LEGACY_AUTH_PATH + '.migrated');
            return;
        }

        db.serialize(() => {
            // Migrate auth.json
            if (fs.existsSync(LEGACY_AUTH_PATH)) {
                try {
                    const authData = JSON.parse(fs.readFileSync(LEGACY_AUTH_PATH, 'utf8'));
                    const normalizedAuth = normalizeAuth(authData);
                    db.run('INSERT INTO auth (username, password) VALUES (?, ?)', [normalizedAuth.username, normalizedAuth.password],
                        (err) => !err && console.log('Migrated auth data.'));
                } catch (e) { console.error('Could not parse or migrate auth.json', e); }
            }

            // Migrate db.json
            if (fs.existsSync(LEGACY_DB_PATH)) {
                try {
                    const dbData = JSON.parse(fs.readFileSync(LEGACY_DB_PATH, 'utf8'));
                    const data = normalizeData(dbData);

                    db.run("INSERT OR REPLACE INTO key_value (key, value) VALUES ('updates', ?)", [data.updates]);
                    db.run("INSERT OR REPLACE INTO key_value (key, value) VALUES ('contactDetails', ?)", [JSON.stringify(data.contactDetails)]);

                    const annStmt = db.prepare('INSERT INTO announcements (id, title, content, date, updatedAt) VALUES (?, ?, ?, ?, ?)');
                    data.announcements.forEach(a => annStmt.run(a.id, a.title, a.content, a.date, a.updatedAt));
                    annStmt.finalize();

                    const tenStmt = db.prepare('INSERT INTO tenders (id, publishDate, startDate, endDate, refNo, description, officeDetail, openLink, date, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    data.tenders.forEach(t => tenStmt.run(t.id, t.publishDate, t.startDate, t.endDate, t.refNo, t.description, t.officeDetail, t.openLink, t.date, t.updatedAt));
                    tenStmt.finalize();

                    const menuStmt = db.prepare('INSERT INTO menu_content (key, label, content, images, pdfs, updatedAt) VALUES (?, ?, ?, ?, ?, ?)');
                    for (const key in data.menuContent) {
                        const item = data.menuContent[key];
                        menuStmt.run(key, item.label, item.content, JSON.stringify(item.images || []), JSON.stringify(item.pdfs || []), item.updatedAt);
                    }
                    menuStmt.finalize(() => console.log('Finished migrating db.json.'));

                } catch (e) { console.error('Could not parse or migrate db.json', e); }
            }

            // Rename files after migration
            if (fs.existsSync(LEGACY_DB_PATH)) fs.renameSync(LEGACY_DB_PATH, LEGACY_DB_PATH + '.migrated');
            if (fs.existsSync(LEGACY_AUTH_PATH)) fs.renameSync(LEGACY_AUTH_PATH, LEGACY_AUTH_PATH + '.migrated');
            console.log('Renamed old JSON files to .migrated');
        });
    });
}

function sanitizeFileName(fileName = 'file') {
    return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '-');
}

// --- Security Best Practice: Credentials ko environment variables se lein ---
let passwordReset = null;

function hashResetCode(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

async function sendResetCodeEmail(code) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`Password reset code for ${RESET_EMAIL}: ${code}`);
        return false;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    await transporter.sendMail({
        from: `"IRI Admin" <${process.env.SMTP_USER}>`,
        to: RESET_EMAIL,
        subject: 'IRI Admin Password Reset Code',
        text: `Your IRI Admin password reset code is ${code}. This code is valid for 10 minutes.`
    });

    return true;
}

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Security Best Practice: Session secret ko environment variable se lein ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-default-fallback-secret-key-is-not-safe',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' } // Production mein 'true' set karein (HTTPS ke liye)
}));

function requireLogin(req, res, next) {
    if (req.session && req.session.user === 'admin') {
        return next();
    }

    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ message: 'Authentication required.' });
    }

    return res.redirect('/admin-login.html');
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'IRI PROJECT.html'));
});

app.get('/IRI PROJECT.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'IRI PROJECT.html'));
});

app.get('/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send('<h1>Login Failed</h1><p>Username and password are required.</p><a href="/admin-login.html">Try again</a>');
    }

    db.get('SELECT * FROM auth WHERE username = ?', [username], (err, user) => {
        if (err || !user || user.password !== password) {
            return res.status(401).send('<h1>Login Failed</h1><p>Invalid username or password.</p><a href="/admin-login.html">Try again</a>');
        }
        req.session.user = user.username;
        res.redirect('/admin-dashboard.html');
    });
});

app.get('/admin-dashboard.html', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/admin-dashboard.html');
        }

        res.clearCookie('connect.sid');
        return res.redirect('/admin-login.html');
    });
});

app.post('/change-password', requireLogin, (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
        return res.status(400).send('New password and confirmation do not match.');
    }

    db.get('SELECT * FROM auth WHERE username = ?', [req.session.user], (err, user) => {
        if (err || !user) {
            return res.status(500).send('Could not find user account.');
        }

        if (currentPassword !== user.password) {
            return res.status(403).send('Incorrect current password.');
        }

        db.run('UPDATE auth SET password = ? WHERE username = ?', [newPassword, req.session.user], (updateErr) => {
            if (updateErr) {
                return res.status(500).send('Error changing password.');
            }
            res.send('Password changed successfully. Please use the new password for your next login.');
        });
    });
});

app.post('/forgot-password/request', async (req, res) => {
    const code = crypto.randomInt(100000, 1000000).toString();

    passwordReset = {
        codeHash: hashResetCode(code),
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
        verified: false,
        token: null
    };

    try {
        const emailSent = await sendResetCodeEmail(code);
        res.json({
            message: emailSent
                ? `6 digit code sent to ${RESET_EMAIL}.`
                : `Email is not configured yet. Check the server terminal for the 6 digit code.`
        });
    } catch (error) {
        passwordReset = null;
        res.status(500).json({ message: 'Could not send reset code. Please check SMTP settings.' });
    }
});

app.post('/forgot-password/verify', (req, res) => {
    const { code } = req.body;

    if (!passwordReset || Date.now() > passwordReset.expiresAt) {
        passwordReset = null;
        return res.status(400).json({ message: 'Code expired. Please request a new code.' });
    }

    if (!/^\d{6}$/.test(String(code || ''))) {
        return res.status(400).json({ message: 'Please enter a valid 6 digit code.' });
    }

    passwordReset.attempts += 1;
    if (passwordReset.attempts > 5) {
        passwordReset = null;
        return res.status(429).json({ message: 'Too many wrong attempts. Please request a new code.' });
    }

    if (hashResetCode(code) !== passwordReset.codeHash) {
        return res.status(400).json({ message: 'Incorrect code.' });
    }

    passwordReset.verified = true;
    passwordReset.token = crypto.randomBytes(24).toString('hex');
    res.json({ message: 'Code verified. Please set a new password.', resetToken: passwordReset.token });
});

app.post('/forgot-password/reset', (req, res) => {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!passwordReset || !passwordReset.verified || passwordReset.token !== resetToken || Date.now() > passwordReset.expiresAt) {
        passwordReset = null;
        return res.status(400).json({ message: 'Reset session expired. Please request a new code.' });
    }

    if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match.' });
    }

    // In a single-admin setup, we update the first user found.
    db.run('UPDATE auth SET password = ? WHERE id = (SELECT id FROM auth LIMIT 1)', [String(newPassword)], function (err) {
        if (err) {
            return res.status(500).json({ message: 'Error saving new password.' });
        }
        passwordReset = null;
        res.json({ message: 'Password saved successfully. You can login now.' });
    });
});

// --- API Endpoints ---

const getAllData = async () => {
    const data = {};
    const queries = [
        new Promise((resolve, reject) => db.get("SELECT value FROM key_value WHERE key = 'updates'", (e, r) => e ? reject(e) : resolve(data.updates = r ? r.value : ''))),
        new Promise((resolve, reject) => db.all("SELECT * FROM announcements ORDER BY date DESC", (e, r) => e ? reject(e) : resolve(data.announcements = r || []))),
        new Promise((resolve, reject) => db.all("SELECT * FROM tenders ORDER BY date DESC", (e, r) => e ? reject(e) : resolve(data.tenders = r || []))),
        new Promise((resolve, reject) => db.all("SELECT * FROM menu_content", (e, r) => {
            if (e) return reject(e);
            data.menuContent = {};
            (r || []).forEach(row => {
                data.menuContent[row.key] = { ...row, images: JSON.parse(row.images || '[]'), pdfs: JSON.parse(row.pdfs || '[]') };
            });
            resolve();
        })),
        new Promise((resolve, reject) => db.get("SELECT value FROM key_value WHERE key = 'contactDetails'", (e, r) => {
            if (e) return reject(e);
            const savedDetails = r ? JSON.parse(r.value) : {};
            data.contactDetails = { ...defaultContactDetails, ...savedDetails };
            resolve();
        }))
    ];
    await Promise.all(queries);
    return data;
};

app.get('/api/data', requireLogin, async (req, res) => {
    try {
        const data = await getAllData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching data.' });
    }
});

app.get('/api/public-data', async (req, res) => {
    try {
        const data = await getAllData();
        res.set('Cache-Control', 'no-store');
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching data.' });
    }
});

app.post('/api/updates', requireLogin, (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string') {
        return res.status(400).json({ message: 'Content must be a string.' });
    }
    db.run("INSERT OR REPLACE INTO key_value (key, value) VALUES ('updates', ?)", [content], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Could not save updates.' });
        }
        res.json({ message: 'Updates saved successfully!' });
    });
});

app.post('/api/contact-details', requireLogin, (req, res) => {
    const {
        primaryEmail,
        secondaryEmail,
        phoneDisplay,
        phoneLink,
        address,
        fax,
        contactTitle,
        directorTitle,
        queryText
    } = req.body;

    if (!primaryEmail || !secondaryEmail || !phoneDisplay || !phoneLink || !address) {
        return res.status(400).json({ message: 'Primary email, secondary email, phone, phone link, and address are required.' });
    }

    const contactDetails = {
        primaryEmail: String(primaryEmail).trim(),
        secondaryEmail: String(secondaryEmail).trim(),
        phoneDisplay: String(phoneDisplay).trim(),
        phoneLink: String(phoneLink).trim(),
        address: String(address).trim(),
        fax: String(fax || '').trim(),
        contactTitle: String(contactTitle || defaultContactDetails.contactTitle).trim(),
        directorTitle: String(directorTitle || defaultContactDetails.directorTitle).trim(),
        queryText: String(queryText || defaultContactDetails.queryText).trim(),
        updatedAt: new Date().toISOString()
    };

    db.run("INSERT OR REPLACE INTO key_value (key, value) VALUES ('contactDetails', ?)", [JSON.stringify(contactDetails)], function (err) {
        if (err) {
            return res.status(500).json({ message: 'Could not save contact details.' });
        }
        res.json({ message: 'Contact details saved successfully!', contactDetails });
    });
});

app.post('/api/announcements', requireLogin, (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required.' });
    }
    const date = new Date().toISOString();
    const id = Date.now();
    db.run('INSERT INTO announcements (id, title, content, date) VALUES (?, ?, ?, ?)', [id, title, content, date], function (err) {
        if (err) {
            return res.status(500).json({ message: 'Could not save announcement.' });
        }
        res.status(201).json({ id, title, content, date });
    });
});

app.put('/api/announcements/:id', requireLogin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required.' });
    }

    const updatedAt = new Date().toISOString();
    db.run('UPDATE announcements SET title = ?, content = ?, updatedAt = ? WHERE id = ?', [title, content, updatedAt, id], function (err) {
        if (err) {
            return res.status(500).json({ message: 'Could not update announcement.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Announcement not found.' });
        }
        db.get('SELECT * FROM announcements WHERE id = ?', [id], (err, row) => {
            res.json(row);
        });
    });
});

app.delete('/api/announcements/:id', requireLogin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.run('DELETE FROM announcements WHERE id = ?', [id], function (err) {
        if (err) {
            return res.status(500).json({ message: 'Could not delete announcement.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Announcement not found.' });
        }
        res.status(204).send();
    });
});

app.post('/api/uploads', requireLogin, (req, res) => {
    const { name, type, dataUrl } = req.body;
    if (!name || !type || typeof dataUrl !== 'string') {
        return res.status(400).json({ message: 'File data is required.' });
    }

    const isAllowed = type.startsWith('image/') || type === 'application/pdf';
    if (!isAllowed) {
        return res.status(400).json({ message: 'Only images and PDF files are allowed.' });
    }

    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        return res.status(400).json({ message: 'Invalid file data.' });
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 15 * 1024 * 1024) {
        return res.status(400).json({ message: 'File size must be 15 MB or less.' });
    }

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safeName = sanitizeFileName(name);
    const storedName = `${Date.now()}-${safeName}`;
    const filePath = path.join(UPLOAD_DIR, storedName);
    fs.writeFileSync(filePath, buffer);

    res.status(201).json({
        name: safeName,
        type,
        size: buffer.length,
        url: `/uploads/${storedName}`
    });
});

app.post('/api/menu-content', requireLogin, (req, res) => {
    const { key, label, content, images, pdfs } = req.body;
    if (!key || !label || typeof content !== 'string') {
        return res.status(400).json({ message: 'Menu item and details are required.' });
    }

    const item = {
        label,
        content,
        images: Array.isArray(images) ? images : [],
        pdfs: Array.isArray(pdfs) ? pdfs : [],
        updatedAt: new Date().toISOString()
    };

    db.run('INSERT OR REPLACE INTO menu_content (key, label, content, images, pdfs, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [key, item.label, item.content, JSON.stringify(item.images), JSON.stringify(item.pdfs), item.updatedAt], function (err) {
            if (err) {
                return res.status(500).json({ message: 'Could not save menu content.' });
            }
            res.json({ message: 'Menu content saved successfully!', item });
        });
});

app.post('/api/tenders', requireLogin, (req, res) => {
    const { publishDate, startDate, endDate, refNo, description, officeDetail, openLink } = req.body;
    if (!publishDate || !startDate || !endDate || !refNo || !description || !officeDetail) {
        return res.status(400).json({ message: 'All tender fields except open link are required.' });
    }

    const tender = {
        id: Date.now(),
        publishDate,
        startDate,
        endDate,
        refNo,
        description,
        officeDetail,
        openLink: openLink || '',
        date: new Date().toISOString()
    };

    db.run('INSERT INTO tenders (id, publishDate, startDate, endDate, refNo, description, officeDetail, openLink, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [tender.id, tender.publishDate, tender.startDate, tender.endDate, tender.refNo, tender.description, tender.officeDetail, tender.openLink, tender.date], function (err) {
            if (err) {
                return res.status(500).json({ message: 'Could not save tender.' });
            }
            res.status(201).json(tender);
        });
});

app.put('/api/tenders/:id', requireLogin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { publishDate, startDate, endDate, refNo, description, officeDetail, openLink } = req.body;
    if (!publishDate || !startDate || !endDate || !refNo || !description || !officeDetail) {
        return res.status(400).json({ message: 'All tender fields except open link are required.' });
    }

    const updatedAt = new Date().toISOString();
    db.run('UPDATE tenders SET publishDate=?, startDate=?, endDate=?, refNo=?, description=?, officeDetail=?, openLink=?, updatedAt=? WHERE id = ?',
        [publishDate, startDate, endDate, refNo, description, officeDetail, openLink || '', updatedAt, id], function (err) {
            if (err) {
                return res.status(500).json({ message: 'Could not update tender.' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ message: 'Tender not found.' });
            }
            db.get('SELECT * FROM tenders WHERE id = ?', [id], (err, row) => {
                res.json(row);
            });
        });
});

app.delete('/api/tenders/:id', requireLogin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.run('DELETE FROM tenders WHERE id = ?', [id], function (err) {
        if (err) {
            return res.status(500).json({ message: 'Could not delete tender.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Tender not found.' });
        }
        res.status(204).send();
    });
});

const rootPublicFiles = new Set([
    'irilogo.jpg',
    'iri-logo-new.jpg',
    'goverment of uttarakhand.png',
    'goverment of india.jpg',
    '1.jpg',
    '1 (1).jpg',
    '1 (2).jpg',
    '3.jpg'
]);

app.get('/:fileName', (req, res, next) => {
    const fileName = req.params.fileName;
    if (!rootPublicFiles.has(fileName)) {
        return next();
    }

    return res.sendFile(path.join(__dirname, fileName));
});

// Uploaded files ko '/uploads' route par serve karein
app.use('/uploads', express.static(UPLOAD_DIR));

function openBrowser(url) {
    if (process.env.AUTO_OPEN === 'false') {
        return;
    }

    const command = process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
            ? `open "${url}"`
            : `xdg-open "${url}"`;

    exec(command, (error) => {
        if (error) {
            console.log(`Could not open browser automatically. Please open ${url}`);
        }
    });
}

function startServer(currentPort) {
    const server = app.listen(currentPort, () => {
        const url = `http://localhost:${currentPort}`;

        console.log(`Server is running at ${url}`);
        openBrowser(url);
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE' && !process.env.PORT) {
            const nextPort = currentPort + 1;
            console.log(`Port ${currentPort} is busy. Trying ${nextPort}...`);
            startServer(nextPort);
            return;
        }

        console.error(error.message);
        process.exit(1);
    });
}

startServer(port);
