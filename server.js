const express = require('express');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const helmet = require('helmet'); // Helmet ko import karein
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

const DB_PATH = path.join(__dirname, 'db.json');
const AUTH_PATH = path.join(__dirname, 'auth.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
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

function normalizeData(data = {}) {
    return {
        updates: typeof data.updates === 'string' ? data.updates : '',
        announcements: Array.isArray(data.announcements) ? data.announcements : [],
        tenders: Array.isArray(data.tenders) ? data.tenders : [],
        menuContent: data.menuContent && typeof data.menuContent === 'object' && !Array.isArray(data.menuContent)
            ? data.menuContent
            : {},
        contactDetails: data.contactDetails && typeof data.contactDetails === 'object' && !Array.isArray(data.contactDetails)
            ? { ...defaultContactDetails, ...data.contactDetails }
            : { ...defaultContactDetails }
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

function normalizeAuth(auth = {}) {
    return {
        username: typeof auth.username === 'string' && auth.username.trim()
            ? auth.username.trim()
            : process.env.ADMIN_USERNAME || 'admin',
        password: typeof auth.password === 'string' && auth.password
            ? auth.password
            : process.env.ADMIN_PASSWORD || 'password123'
    };
}

function readAuth() {
    try {
        const auth = fs.readFileSync(AUTH_PATH, 'utf8');
        return normalizeAuth(JSON.parse(auth));
    } catch (error) {
        const initialAuth = normalizeAuth();
        fs.writeFileSync(AUTH_PATH, JSON.stringify(initialAuth, null, 2), 'utf8');
        return initialAuth;
    }
}

function writeAuth(auth) {
    fs.writeFileSync(AUTH_PATH, JSON.stringify(normalizeAuth(auth), null, 2), 'utf8');
}

function sanitizeFileName(fileName = 'file') {
    return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '-');
}

// --- Security Best Practice: Credentials ko environment variables se lein ---
let adminCredentials = readAuth();
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
        writeAuth(adminCredentials);
        return res.send('Password changed successfully. Please use the new password for your next login.');
    }

    return res.status(403).send('Incorrect current password.');
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

    adminCredentials.password = String(newPassword);
    writeAuth(adminCredentials);
    passwordReset = null;

    res.json({ message: 'Password saved successfully. You can login now.' });
});

// --- API Endpoints ---

app.get('/api/data', requireLogin, (req, res) => {
    const data = readData();
    res.json(data);
});

app.get('/api/public-data', (req, res) => {
    const data = readData();
    res.set('Cache-Control', 'no-store');
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

    const data = readData();
    data.contactDetails = {
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
    writeData(data);
    res.json({ message: 'Contact details saved successfully!', contactDetails: data.contactDetails });
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

app.put('/api/announcements/:id', requireLogin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required.' });
    }

    const data = readData();
    const index = data.announcements.findIndex(a => a.id === id);
    if (index === -1) {
        return res.status(404).json({ message: 'Announcement not found.' });
    }

    data.announcements[index] = {
        ...data.announcements[index],
        title,
        content,
        updatedAt: new Date().toISOString()
    };
    writeData(data);
    res.json(data.announcements[index]);
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

app.put('/api/tenders/:id', requireLogin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { publishDate, startDate, endDate, refNo, description, officeDetail, openLink } = req.body;
    if (!publishDate || !startDate || !endDate || !refNo || !description || !officeDetail) {
        return res.status(400).json({ message: 'All tender fields except open link are required.' });
    }

    const data = readData();
    const index = data.tenders.findIndex(t => t.id === id);
    if (index === -1) {
        return res.status(404).json({ message: 'Tender not found.' });
    }

    data.tenders[index] = {
        ...data.tenders[index],
        publishDate,
        startDate,
        endDate,
        refNo,
        description,
        officeDetail,
        openLink: openLink || '',
        updatedAt: new Date().toISOString()
    };
    writeData(data);
    res.json(data.tenders[index]);
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

const rootPublicFiles = new Set([
    'irilogo.jpg',
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
