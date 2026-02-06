const http = require('http');

const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/health',
    method: 'GET'
}, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (e) => console.error(`ERROR: ${e.message}`));
req.end();
