const bcrypt = require('bcrypt');
try {
    console.log('Testing bcrypt...');
    const hash = bcrypt.hashSync('test', 10);
    console.log('Hash success:', hash);
} catch (e) {
    console.error('Bcrypt failed:', e);
}
