const db = require('./database');
try {
    console.log('Testing DB...');
    const users = db.getAllUsers();
    console.log('Users:', users);
} catch (e) {
    console.error('DB failed:', e);
}
