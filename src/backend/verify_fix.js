// Load env vars FIRST
require('dotenv').config();

const db = require('./database');
const http = require('http');

async function verify() {
    console.log("Initializing DB...");
    await db.initDatabase();

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        console.error("Missing ENV vars!");
        process.exit(1);
    }

    // LIST EXISTING PUBLIC LINKS
    const { data: links } = await db.supabase.from('public_links').select('*').limit(1);

    let testId;

    if (links && links.length > 0) {
        testId = links[0].public_id;
        console.log("Found existing public link:", testId);
    } else {
        console.log("No existing public links. Creating one...");
        const { data: files } = await db.supabase.from('files').select('*').limit(1);
        if (!files || files.length === 0) {
            console.error("No files found.");
            return;
        }
        const file = files[0];
        try {
            const newLink = await db.createPublicLink(file.project_id, file.id);
            testId = newLink.public_id;
            console.log("Created test link:", testId);
        } catch (e) {
            console.error("Creation failed:", e);
            return;
        }
    }

    // 2. Test the endpoint
    const url = `http://localhost:3001/api/share/${testId}`;
    console.log(`Testing GET ${url}...`);

    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            console.log("Response Status:", res.statusCode);

            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log("Response Body:", data);
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode === 200 && json.modelUrl) {
                        console.log("✅ SUCCESS: Legacy link resolved.");
                        resolve();
                    } else {
                        console.error("❌ FAILED: Invalid response.");
                        reject();
                    }
                } catch (e) {
                    console.error("❌ FAILED: Invalid JSON", e);
                    reject();
                }
            });
        }).on('error', (e) => {
            console.error("❌ FAILED: Request error", e);
            reject(e);
        });
    });
}

verify().then(() => process.exit(0)).catch(() => process.exit(1));
