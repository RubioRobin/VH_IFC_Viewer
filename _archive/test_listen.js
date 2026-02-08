const express = require('express');
const app = express();
try {
    const server = app.listen(3000, () => {
        console.log('Listening on 3000');
        server.close();
    });
    server.on('error', (e) => console.error('Listen failed:', e));
} catch (e) {
    console.error('Setup failed:', e);
}
