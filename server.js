const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Güvenlik ve CORS ayarları
// app.use(helmet()); // Helmet'i debug için kapatıyoruz
app.use(cors());

// Statik dosyaları sun (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Deprem verilerini saklamak için in-memory depolama
let earthquakeData = {
    features: [],
    metadata: {},
    lastUpdated: null
};

// API URL'leri
// USGS: Son 30 gün (Geniş veri seti)
const USGS_API_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';
// Kandilli: Canlı (Türkiye tamamlayıcı kaynak)
const KANDILLI_API_URL = 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live';

// Yardımcı Fonksiyon: Haversine Formülü ile Mesafe (km)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Dünya yarıçapı (km)
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat1)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

const fs = require('fs');
const turf = require('@turf/turf');

// Ülke Sınırlarını Yükle (Sync - Sadece başlangıçta)
let worldFeatures = [];
try {
    const rawData = fs.readFileSync(path.join(__dirname, 'public', 'data', 'countries.geojson'), 'utf-8');
    const geoData = JSON.parse(rawData);
    worldFeatures = geoData.features;
    console.log(`[INIT] ${worldFeatures.length} ülke sınırı yüklendi.`);
} catch (e) {
    console.error(`[CRITICAL] Ülke verileri yüklenemedi: ${e.message}`);
}

// Verileri çekme fonksiyonu (Polling)
const fetchEarthquakeData = async () => {
    try {
        console.log(`[${new Date().toLocaleTimeString('tr-TR')}] Deprem verileri güncelleniyor...`);

        // 1. İki kaynaktan paralel veri çek
        const [usgsResp, kandilliResp] = await Promise.all([
            axios.get(USGS_API_URL).catch(e => ({ data: null })),
            axios.get(KANDILLI_API_URL).catch(e => ({ data: null }))
        ]);

        let combinedFeatures = [];

        // 2. USGS Verisini İşle (Ana Kaynak)
        let usgsFeatures = [];
        if (usgsResp && usgsResp.data && usgsResp.data.features) {
            usgsFeatures = usgsResp.data.features.map(f => {
                f.properties.source = "USGS"; // Kaynak etiketi
                return f;
            });
            combinedFeatures = [...usgsFeatures];
        }

        // 3. Kandilli Verisini İşle ve Çakışmaları Özelleştir
        if (kandilliResp && kandilliResp.data && kandilliResp.data.result) {
            const kandilliRaw = kandilliResp.data.result;

            // Kandilli verisini GeoJSON formatına çevir
            const kandilliFeatures = kandilliRaw.map(k => {
                // Zaman düzeltmesi: Kandilli genelde saniye dönebilir veya string tarih
                // API created_at timestamp (saniye) veriyor mu? Evet.
                let timeMs = k.created_at * 1000; // Saniyeyi ms yap
                if (!timeMs && k.date_time) {
                    timeMs = new Date(k.date_time).getTime();
                }

                return {
                    type: "Feature",
                    properties: {
                        mag: k.mag,
                        place: k.title,
                        time: timeMs,
                        url: null,
                        title: k.title,
                        source: "Kandilli",
                        depth: k.depth
                    },
                    geometry: {
                        type: "Point",
                        coordinates: [
                            k.geojson.coordinates[0], // Longitude
                            k.geojson.coordinates[1], // Latitude
                            k.depth // Depth
                        ]
                    },
                    id: `kan_${k.earthquake_id}` // Unique ID prefix
                };
            });

            // 4. Çakışma Kontrolü (Deduplication)
            // Kural: Zaman farkı <= 20sn VE Mesafe <= 10km ise USGS'i tut, Kandilli'yi at.
            const uniqueKandilli = kandilliFeatures.filter(kandilliQ => {
                const kTime = kandilliQ.properties.time;
                const kCoords = kandilliQ.geometry.coordinates;

                // USGS içinde eşleşen var mı?
                const isDuplicate = usgsFeatures.some(usgsQ => {
                    const uTime = usgsQ.properties.time;
                    const uCoords = usgsQ.geometry.coordinates;

                    const timeDiff = Math.abs(kTime - uTime);
                    const distKm = getDistanceFromLatLonInKm(kCoords[1], kCoords[0], uCoords[1], uCoords[0]);

                    return timeDiff <= 20000 && distKm <= 10;
                });

                return !isDuplicate; // Eşleşme yoksa listeye ekle
            });

            // 5. Birleştir
            combinedFeatures = [...combinedFeatures, ...uniqueKandilli];
        }

        // --- SERVER-SIDE SPATIAL ANALYSIS (Land vs Sea) ---
        // Client tarafını yormamak için her depremin "isLand" durumunu hesapla
        if (worldFeatures.length > 0) {
            console.log('Sunucu tarafında uzamsal analiz yapılıyor...');
            combinedFeatures.forEach(q => {
                try {
                    const pt = turf.point(q.geometry.coordinates);
                    // Burada basit bir "some" loop'u var ama node.js tarafında (server thread) çalışacak.
                    // Client UI donmayacak.
                    q.properties.isLand = worldFeatures.some(country => {
                        return turf.booleanPointInPolygon(pt, country);
                    });
                } catch (e) {
                    q.properties.isLand = false;
                }
            });
        }

        // Zamana göre yeniden sırala (Yeniden eskiye)
        combinedFeatures.sort((a, b) => b.properties.time - a.properties.time);


        earthquakeData = {
            type: "FeatureCollection",
            metadata: {
                generated: Date.now(),
                url: "Hybrid (USGS + Kandilli)",
                title: "Unified Earthquake Data",
                status: 200,
                api: "v1"
            },
            features: combinedFeatures,
            lastUpdated: new Date()
        };

        console.log(`[BASARILI] Toplam ${combinedFeatures.length} adet deprem verisi birleştirildi.`);

    } catch (error) {
        console.error("Veri çekme hatası:", error.message);
    }
};

// Sunucu başladığında hemen veri çek
fetchEarthquakeData();

// 20 saniyede bir verileri güncelle (Polling)
setInterval(fetchEarthquakeData, 20000);

// API Endpoint: Deprem verilerini döndür
app.get('/api/earthquakes', (req, res) => {
    res.json({
        success: true,
        data: earthquakeData,
        serverTime: new Date()
    });
});

// Ana sayfa yönlendirmesi
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
    console.log(`Ağdan erişim: http://${require('os').networkInterfaces()['Ethernet'] ? require('os').networkInterfaces()['Ethernet'][1].address : 'IP_ADRESINIZ'}:${PORT}`);
});
