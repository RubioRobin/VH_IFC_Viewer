const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001/api';
const JAR_PATH = 'cookie.json';

// Simple fetch wrapper
async function request(endpoint, options = {}) {
    // Load cookie
    let headers = { 'Content-Type': 'application/json' };
    if (fs.existsSync(JAR_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(JAR_PATH));
        // Node fetch doesn't handle cookies automatically like browsers.
        // We need to manually set Cookie header.
        // The cookie from login is an array of strings like "connect.sid=...; Path=/; HttpOnly"
        headers['Cookie'] = cookies.map(c => c.split(';')[0]).join('; ');
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
    });

    // Save cookie if present
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
        // Node fetch returns a string or array?
        // In Node 18 fetch, headers.get('set-cookie') returns all cookies combined?
        // Actually fetch spec says get returns first. getSetCookie() returns array.
        // Let's try simple aproach.
        // For express-session, it's usually one cookie.
        // We will just save it.
        // Note: 'set-cookie' header might be split.
        // For simplicity in this test, we just grabbing what we can.
        // If it's a list, we might need iteration.
        // Let's assume one session cookie for now.
        const cookies = [];
        res.headers.forEach((v, k) => {
            if (k === 'set-cookie') cookies.push(v);
        });
        // Wait, headers structure in built-in fetch...
        // Let's use raw log to see.
        // But for login flow, we just need the 'connect.sid'.

        // Actually, let's just use what we get.
        // built-in fetch headers object is tricky in Node.
        // Let's just try to parse it.
    }

    // Better manual cookie handling for Node fetch:
    // This is getting complicated without a library.
    // Let's try to just capture the login response headers.

    return res;
}

// Login needs special handling to capture Set-Cookie
async function login() {
    console.log('1. Logging in...');
    try {
        const res = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'YOUR_PASSWORD_HERE' })
        });

        if (res.ok) {
            // Get raw headers
            // Node fetch: headers.getSetCookie()
            let cookies = [];
            if (res.headers.getSetCookie) {
                cookies = res.headers.getSetCookie();
            } else {
                // Fallback
                const c = res.headers.get('set-cookie');
                if (c) cookies.push(c);
            }

            if (cookies.length > 0) {
                fs.writeFileSync(JAR_PATH, JSON.stringify(cookies));
                console.log('   Login Success. Cookie saved.');
                return true;
            }
        } else {
            console.log('   Login Failed Status:', res.status);
            const text = await res.text();
            console.log('   Body:', text);
        }
    } catch (e) {
        console.error('   Login Error:', e.message);
    }
    return false;
}

async function run() {
    if (!await login()) return;

    try {
        // 2. Create Project
        console.log('\n2. Creating Project...');
        const pRes = await request('/projects', {
            method: 'POST',
            body: JSON.stringify({
                name: 'Test Project ' + Date.now(),
                description: 'Automated Test',
                status: 'active'
            })
        });
        if (!pRes.ok) throw new Error(`Create Project failed: ${pRes.status} ${await pRes.text()}`);
        const project = await pRes.json();
        const projectId = project.id;
        console.log('   Project Created:', projectId);

        // 3. Reserve QR
        console.log('\n3. Reserving QR...');
        const rRes = await request('/upload/reserve', {
            method: 'POST',
            body: JSON.stringify({
                projectId: projectId,
                fileName: 'Construction_V1.ifc'
            })
        });
        if (!rRes.ok) throw new Error(`Reserve failed: ${rRes.status} ${await rRes.text()}`);
        const reserveData = await rRes.json();
        console.log('   QR Reserved. File ID:', reserveData.fileId);

        // 4. List QRs
        console.log('\n4. Listing QRs...');
        const qRes = await request('/qr');
        if (!qRes.ok) throw new Error(`List QR failed: ${qRes.status}`);
        const qrs = await qRes.json();
        console.log('   QRs found:', qrs.length);

        // 5. Cleanup
        console.log('\n5. Deleting Project...');
        await request(`/projects/${projectId}`, { method: 'DELETE' });
        console.log('   Project Deleted.');

    } catch (e) {
        console.error('Test Failed:', e.message);
    }
}

run();
