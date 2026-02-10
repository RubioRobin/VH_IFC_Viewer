// Test the upload init endpoint
const API_URL = 'http://localhost:3001';
const ADMIN_KEY = '8205df224312077ca34a0f846ba6b945200dd83980b';

async function testUploadInit() {
    try {
        const response = await fetch(`${API_URL}/api/upload/init`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ADMIN_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectId: '2e12255a-d922-4c85-98ad-56c0d8638b94',
                fileName: 'test.ifc',
                fileSize: 1000000
            })
        });

        const data = await response.json();
        console.log('\n✅ Upload Init Response:');
        console.log(JSON.stringify(data, null, 2));

        if (data.signedUploadUrl) {
            console.log('\n✅ Signed upload URL generated successfully!');
            console.log('Model ID:', data.modelId);
            console.log('Revision ID:', data.revisionId);
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

testUploadInit();
