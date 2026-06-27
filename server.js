const express = require('express');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const open = require('open').default;

const app = express();
const port = process.env.PORT || 3000;

// --- डेटाबेस सिमुलेशन (JSON फ़ाइल) ---
const DB_PATH = path.join(__dirname, 'db.json');

function readData() {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('Database file not found, creating one.');
        const initialData = { updates: "", announcements: [], tenders: [] };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
        return initialData;
    }
}

function writeData(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

let adminCredentials = {
    username: 'admin',
    password: 'password123'
};

app.use(express.json());
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

app.listen(port, async () => {
    const url = `http://localhost:${port}`;

    console.log(`Server is running at ${url}`);

    await open(url);
});