
const https = require('https');

const domains = [
    'vh-ifc-viewer-m783.onrender.com',
    'vh-ifc-backend.onrender.com'
];

const paths = [
    { path: '/', method: 'GET' },
    { path: '/api/health', method: 'GET' },
    { path: '/api/upload/init', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 2 } } // sending {}
];

domains.forEach(hostname => {
    paths.forEach(({ path, method, headers }) => {
        const options = {
            hostname,
            port: 443,
            path,
            method,
            headers: headers || {}
        };

        const req = https.request(options, (res) => {
            console.log(`[${hostname}] ${method} ${path} -> ${res.statusCode}`);
        });

        req.on('error', (e) => {
            // console.error(`[${hostname}] ${method} ${path} -> ERROR: ${e.message}`);
        });

        if (method === 'POST') req.write('{}');
        req.end();
    });
});
