const axios = require('axios');

async function add6thPoi() {
    const loginRes = await axios.post('http://localhost:3000/api/v1/auth/login', {
        email: 'admin@vngo.com',
        password: 'password123'
    });
    const token = loginRes.data.data.token;

    let poiId;
    try {
        const poiRes = await axios.post('http://localhost:3000/api/v1/pois', {
            code: 'VNM-SGN-006',
            name: 'War Remnants Museum',
            location: {
                lat: 10.7795,
                lng: 106.6926
            },
            content: {
                vi: 'Bảo tàng Chứng tích Chiến tranh',
                en: 'War Remnants Museum'
            }
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Created 6th POI:', poiRes.data.data.code);
        poiId = poiRes.data.data.id;
    } catch (err) {
        console.log('Creation failed or already exists, searching master list...');
        const allPoisRes = await axios.get('http://localhost:3000/api/v1/admin/pois/master', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const existing = allPoisRes.data.data.find(p => p.code === 'VNM-SGN-006');
        if (!existing) throw new Error('POI not found after creation failure');
        poiId = existing.id;
    }

    // Approve it
    await axios.post(`http://localhost:3000/api/v1/admin/pois/${poiId}/approve`, {}, {
        headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Approved 6th POI');
}

add6thPoi();
