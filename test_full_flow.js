
const https = require('https');
const fs = require('fs');

// Config
const API_URL = 'https://vh-ifc-backend.onrender.com';
const API_KEY = '8205df224312077ca34a0f846ba6b945200dd83980b';
const PROJECT_ID = '2e12255a-d922-4c85-98ad-56c0d8638b94';

// Helper for requests
function request(method, path, body = null, isBinary = false) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_URL + path);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        };

        if (body && !isBinary) {
            options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
        }

        console.log(`[${method}] ${path}...`);

        const req = https.request(options, (res) => {
            if (res.statusCode >= 400) {
                console.error(`Status: ${res.statusCode}`);
                // reject(new Error(`Status ${res.statusCode}`));
                // Don't reject yet, read body
            }

            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const responseBody = buffer.toString();

                if (res.statusCode >= 400) {
                    reject(new Error(`Request failed (${res.statusCode}): ${responseBody}`));
                } else {
                    try {
                        const json = JSON.parse(responseBody);
                        resolve(json);
                    } catch (e) {
                        // If not JSON (like image), return buffer if successful?
                        if (res.headers['content-type']?.includes('image')) {
                            resolve(buffer);
                        } else {
                            resolve(responseBody); // Redirect or text
                        }
                    }
                }
            });
        });

        req.on('error', e => reject(e));

        if (body) {
            req.write(isBinary ? body : JSON.stringify(body));
        }
        req.end();
    });
}

// Special helper for file upload (PUT to signed URL)
function uploadFile(signedUrl, filePath) {
    return new Promise((resolve, reject) => {
        const stats = fs.statSync(filePath);
        const stream = fs.createReadStream(filePath);
        const url = new URL(signedUrl);

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': stats.size
            }
        };

        console.log(`[PUT] Uploading file to storage...`);
        const req = https.request(options, (res) => {
            console.log(`Upload Status: ${res.statusCode}`);
            if (res.statusCode >= 400) reject(new Error(`Upload failed: ${res.statusCode}`));
            else resolve();
        });

        stream.pipe(req);
    });
}

// Special helper for QR download (handling redirects)
function downloadQr(path) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_URL + path);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        };

        console.log(`[GET] Downloading QR: ${path}`);
        https.get(options, (res) => {
            console.log(`QR Response: ${res.statusCode}`);
            if (res.statusCode === 302 || res.statusCode === 307) {
                console.log(`Redirecting to: ${res.headers.location}`);
                // Download from new location (no auth needed for signed url usually)
                https.get(res.headers.location, (imgRes) => {
                    console.log(`Image Response: ${imgRes.statusCode}`);
                    const chunks = [];
                    imgRes.on('data', d => chunks.push(d));
                    imgRes.on('end', () => resolve(Buffer.concat(chunks)));
                }).on('error', reject);
            } else if (res.statusCode === 200) {
                const chunks = [];
                res.on('data', d => chunks.push(d));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            } else {
                reject(new Error(`QR Download failed: ${res.statusCode}`));
            }
        }).on('error', reject);
    });
}

async function run() {
    try {
        // 1. Init
        // Create dummy file
        fs.writeFileSync('temp.ifc', 'dummy content');
        const initData = await request('POST', '/api/upload/init', {
            projectId: PROJECT_ID,
            fileName: 'temp.ifc',
            fileSize: 13
        });
        console.log('Init success:', initData);

        // 2. Upload
        await uploadFile(initData.signedUploadUrl, 'temp.ifc');
        console.log('Upload success');

        // 3. Complete
        const completeData = await request('POST', '/api/upload/complete', {
            modelId: initData.modelId,
            revisionId: initData.revisionId
        });
        console.log('Complete success:', completeData);

        // 4. Download QR
        const qrBuffer = await downloadQr(completeData.qrDownloadUrl);
        console.log(`QR Download success! Size: ${qrBuffer.length} bytes`);

    } catch (e) {
        console.error('ERROR:', e.message);
    }
}

run();
