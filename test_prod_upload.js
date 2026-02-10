
const https = require('https');

const data = JSON.stringify({
    projectId: '2e12255a-d922-4c85-98ad-56c0d8638b94',
    fileName: 'test_prod_debug.ifc',
    fileSize: 1024
});

const options = {
    hostname: 'vh-ifc-viewer-m783.onrender.com',
    port: 443,
    path: '/api/upload/init',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer 8205df224312077ca34a0f846ba6b945200dd83980b'
    }
};

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
