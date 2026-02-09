// Test production API
const API_URL = 'https://vh-ifc-viewer-backend.onrender.com';
const ADMIN_KEY = '8205df224312077ca34a0f846ba6b945200dd83980b';

async function testProductionAPI() {
    console.log('🧪 Testing Production API...\n');

    // Test 1: Upload Init
    try {
        console.log('1️⃣ Testing /api/upload/init...');
        const response = await fetch(`${API_URL}/api/upload/init`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ADMIN_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectId: 'test-project-1',
                fileName: 'production-test.ifc',
                fileSize: 1000000
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('❌ Error:', response.status, error);
            return;
        }

        const data = await response.json();
        console.log('✅ Upload Init Success!');
        console.log('   Model ID:', data.modelId);
        console.log('   Revision ID:', data.revisionId);
        console.log('   Signed URL:', data.signedUploadUrl ? '✅ Generated' : '❌ Missing');
        console.log('   Expires At:', data.expiresAt);

        return data;
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testProductionAPI();
