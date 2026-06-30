const express = require('express');
const path = require('path');
const session = require('express-session');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// --- डेटाबेस सिमुलेशन (JSON फ़ाइल) ---
const DB_PATH = path.join(__dirname, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

function normalizeData(data = {}) {
    return {
        updates: typeof data.updates === 'string' ? data.updates : '',
        announcements: Array.isArray(data.announcements) ? data.announcements : [],
        tenders: Array.isArray(data.tenders) ? data.tenders : [],
        menuContent: data.menuContent && typeof data.menuContent === 'object' && !Array.isArray(data.menuContent)
            ? data.menuContent
            : {}
    };
}

function readData() {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return normalizeData(JSON.parse(data));
    } catch (error) {
        console.log('Database file not found, creating one.');
        const initialData = normalizeData();
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
        return initialData;
    }
}

function writeData(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function sanitizeFileName(fileName = 'file') {
    return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '-');
}

let adminCredentials = {
    username: 'admin',
    password: 'password123'
};

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'my-secret-key-for-iri-project',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
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

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === adminCredentials.username && password === adminCredentials.password) {
        req.session.user = 'admin';
        return res.redirect('/admin-dashboard.html');
    }

    return res.status(401).send('<h1>Login Failed</h1><p>Invalid username or password.</p><a href="/admin-login.html">Try again</a>');
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

    if (currentPassword === adminCredentials.password) {
        adminCredentials.password = newPassword;
        return res.send('Password changed successfully. Please use the new password for your next login.');
    }

    return res.status(403).send('Incorrect current password.');
});

// --- API Endpoints ---

app.get('/api/data', requireLogin, (req, res) => {
    const data = readData();
    res.json(data);
});

app.get('/api/public-data', (req, res) => {
    const data = readData();
    res.json(data);
});

app.post('/api/updates', requireLogin, (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string') {
        return res.status(400).json({ message: 'Content must be a string.' });
    }
    const data = readData();
    data.updates = content;
    writeData(data);
    res.json({ message: 'Updates saved successfully!' });
});

app.post('/api/announcements', requireLogin, (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required.' });
    }
    const data = readData();
    const newAnnouncement = { id: Date.now(), title, content, date: new Date().toISOString() };
    data.announcements.unshift(newAnnouncement);
    writeData(data);
    res.status(201).json(newAnnouncement);
});

app.delete('/api/announcements/:id', requireLogin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const data = readData();
    const initialLength = data.announcements.length;
    data.announcements = data.announcements.filter(a => a.id !== id);
    if (data.announcements.length === initialLength) {
        return res.status(404).json({ message: 'Announcement not found.' });
    }
    writeData(data);
    res.status(204).send();
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

    const data = readData();
    data.menuContent[key] = {
        label,
        content,
        images: Array.isArray(images) ? images : [],
        pdfs: Array.isArray(pdfs) ? pdfs : [],
        updatedAt: new Date().toISOString()
    };
    writeData(data);
    res.json({ message: 'Menu content saved successfully!', item: data.menuContent[key] });
});

app.post('/api/tenders', requireLogin, (req, res) => {
    const { publishDate, startDate, endDate, refNo, description, officeDetail, openLink } = req.body;
    if (!publishDate || !startDate || !endDate || !refNo || !description || !officeDetail) {
        return res.status(400).json({ message: 'All tender fields except open link are required.' });
    }

    const data = readData();
    const newTender = {
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
    data.tenders.unshift(newTender);
    writeData(data);
    res.status(201).json(newTender);
});

app.delete('/api/tenders/:id', requireLogin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const data = readData();
    const initialLength = data.tenders.length;
    data.tenders = data.tenders.filter(t => t.id !== id);
    if (data.tenders.length === initialLength) {
        return res.status(404).json({ message: 'Tender not found.' });
    }
    writeData(data);
    res.status(204).send();
});

app.use(express.static(__dirname, {
    index: false
}));

const { exec } = require('child_process');

app.listen(port, () => {
    const url = `http://localhost:${port}`;

    console.log(`Server is running at ${url}`);

    exec(`start ${url}`);
});
