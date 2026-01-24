// --- Harita Altlıkları (Base Maps) ---

// 1. Karanlık Mod (Varsayılan)
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
});

// 2. Uydu Görüntüsü (Esri)
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// 3. Açık/Sokak Haritası (OpenStreetMap)
const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
});

// 4. Mimari/Arazi (Carto Light)
const lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
});


// Harita Başlatma
const map = L.map('map', {
    center: [39.9334, 32.8597],
    zoom: 6,
    zoomControl: false,
    layers: [darkLayer] // Varsayılan katman
});

// --- ÖZEL PANE YÖNETİMİ (Z-INDEX KONTROLÜ) ---
// Depremlerin her zaman en üstte olması için özel bir katman (Pane) oluşturuyoruz.
map.createPane('earthquakePane');
map.getPane('earthquakePane').style.zIndex = 650; // MarkerPane(600) ve PopupPane(700) arasında veya üstünde
map.getPane('earthquakePane').style.pointerEvents = 'none'; // Tıklamalar marker'a geçsin, pane engellemesin

// En Son Deprem İçin "Süper Üst" Katman (Cluster'ın da üstünde)
map.createPane('latestPane');
map.getPane('latestPane').style.zIndex = 800; // En üst
map.getPane('latestPane').style.pointerEvents = 'none';

// [YENİ] Etki Alanı için ALT KATMAN (Haritanın hemen üstü, markerların altı)
map.createPane('impactPane');
map.getPane('impactPane').style.zIndex = 450; // OverlayPane(400) üstü, Marker(600) altı
map.getPane('impactPane').style.pointerEvents = 'none'; // Pane'in kendisi tıklama engellemesin

// Katman Kontrolü (Sağ Üst - Altlıklar)
// Katman Kontrolü (Sağ ALT - Zoom yanına)
const baseMaps = {
    "Karanlık": darkLayer,
    "Uydu": satelliteLayer,
    "Sokak": streetLayer,
    "Aydınlık": lightLayer
};

L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map);

L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// --- ÖZEL LEJANT / KATMAN KONTROLÜ (SOL ALT - AÇILIR/KAPANIR) ---
const LegendControl = L.Control.extend({
    options: {
        position: 'bottomleft'
    },

    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar custom-legend');

        // Başlık (Tıklanabilir)
        const header = L.DomUtil.create('div', 'legend-header', container);
        header.innerHTML = '<span>KATMANLAR</span> <span class="toggle-icon">¡</span>';

        // İçerik Alanı
        const content = L.DomUtil.create('div', 'legend-content', container);

        // Header Tıklama Olayı
        header.onclick = () => {
            if (content.style.display === 'none') {
                content.style.display = 'block';
                header.querySelector('.toggle-icon').innerText = '¡';
            } else {
                content.style.display = 'none';
                header.querySelector('.toggle-icon').innerText = '^';
            }
        };

        // 1. Depremler Toggle (Tüm Deprem Katmanları)
        this._createToggle(content, 'Depremler', true, (checked) => {
            // Cluster Paneli
            const eqPane = map.getPane('earthquakePane');
            if (eqPane) eqPane.style.display = checked ? 'block' : 'none';

            // En Son Deprem Paneli
            const latestPane = map.getPane('latestPane');
            if (latestPane) latestPane.style.display = checked ? 'block' : 'none';

            // Etki Alanı Paneli
            const impactPane = map.getPane('impactPane');
            if (impactPane) impactPane.style.display = checked ? 'block' : 'none';
        });

        // 2. Fay Hatları Toggle
        this._createToggle(content, 'Fay Hatları', true, (checked) => {
            if (faultsLayer) {
                faultsLayer.setStyle({ opacity: checked ? 0.6 : 0 });
            }
        });

        // 3. Ülke Sınırları Toggle
        this._createToggle(content, 'Ülke Sınırları', true, (checked) => {
            if (countriesLayer) {
                // Sadece stroke (çizgi) opacity'sini kapatıp açıyoruz, fill zaten düşük
                countriesLayer.setStyle({
                    opacity: checked ? 0.5 : 0,
                    fillOpacity: checked ? 0.05 : 0
                });
            }
        });

        // 4. [YENİ] Tarihteki Yıkıcı Depremler
        this._createToggle(content, 'Tarihi Depremler (100 Yıl)', false, (checked) => {
            if (checked) {
                // Veri yüklü değilse yükle (Layer boşsa)
                if (historyLayer.getLayers().length === 0) {
                    loadHistoryData().then(() => {
                        map.addLayer(historyLayer);
                    });
                } else {
                    map.addLayer(historyLayer);
                }
            } else {
                map.removeLayer(historyLayer);
            }
        });

        // --- Renk Skalası (Lejant - Kandilli Tipi) ---
        const scaleContainer = L.DomUtil.create('div', 'legend-scale', content);
        scaleContainer.innerHTML = `
            <div class="scale-header">Büyüklük (Mag)</div>
            <div class="scale-item"><span style="background:#550000"></span> 7.0+ (Çok Yıkıcı)</div>
            <div class="scale-item"><span style="background:#a80000"></span> 6.0 - 6.9 (Yıkıcı)</div>
            <div class="scale-item"><span style="background:#ff0000"></span> 5.0 - 5.9 (Şiddetli)</div>
            <div class="scale-item"><span style="background:#ff8c00"></span> 4.0 - 4.9 (Orta)</div>
            <div class="scale-item"><span style="background:#ffd700"></span> 3.0 - 3.9 (Hafif)</div>
            <div class="scale-item"><span style="background:#1e90ff"></span> < 3.0 (Küçük)</div>
        `;

        // Tıklamaların haritaya geçmesini engelle
        L.DomEvent.disableClickPropagation(container);
        return container;
    },

    _createToggle: function (parent, label, checked, callback) {
        const row = L.DomUtil.create('div', 'legend-row', parent);

        const labelEl = L.DomUtil.create('label', 'legend-label', row);

        const checkbox = L.DomUtil.create('input', '', labelEl);
        checkbox.type = 'checkbox';
        checkbox.checked = checked;

        const span = L.DomUtil.create('span', '', labelEl);
        span.innerText = ` ${label}`;

        checkbox.addEventListener('change', (e) => callback(e.target.checked));
    }
});

map.addControl(new LegendControl());

// --- [YENİ] Konum Butonu (Leaflet Custom Control) ---
const LocateControl = L.Control.extend({
    options: {
        position: 'bottomright' // Zoom butonunun hemen üstüne
    },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.style.backgroundColor = 'white';
        container.style.width = '30px';
        container.style.height = '30px';
        container.style.cursor = 'pointer';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';

        container.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <circle cx="12" cy="12" r="9"></circle>
            <circle cx="12" cy="12" r="3" fill="#333"></circle>
        </svg>
        `;

        container.onclick = function () {
            // Konum İsteği
            map.locate({ setView: true, maxZoom: 9 });
        }

        return container;
    }
});

map.addControl(new LocateControl());

// --- [YENİ] Anlık Konum & Uyarı Sistemi ---
const ALERT_RADIUS_KM = 100;
const ALERT_MIN_MAG = 4.0;
const ALERT_TIME_LIMIT_HOURS = 24;

map.on('locationfound', function (e) {
    const userLatlng = e.latlng;
    const radius = e.accuracy / 2;

    // 1. Marker & Circle
    if (window.userLocationMarker) {
        map.removeLayer(window.userLocationMarker);
        map.removeLayer(window.userLocationCircle);
    }

    window.userLocationMarker = L.marker(userLatlng, {
        icon: L.divIcon({
            className: 'user-location-marker',
            html: '<div class="user-dot"></div>',
            iconSize: [20, 20]
        })
    }).addTo(map).bindPopup("Sizin Konumunuz").openPopup();

    window.userLocationCircle = L.circle(userLatlng, radius).addTo(map);

    // 2. [YENİ] Yakınlık Kontrolü
    checkProximityAlert(userLatlng);
});

function checkProximityAlert(userLatlng) {
    if (!allEarthquakes.length) return;

    const container = document.getElementById('alert-container');
    container.innerHTML = ''; // Önceki uyarıları temizle

    const now = Date.now();
    const userPoint = turf.point([userLatlng.lng, userLatlng.lat]);

    // Filtrele
    const nearbyQuakes = allEarthquakes.filter(q => {
        const props = q.properties;
        const timeDiff = (now - props.time) / (1000 * 60 * 60); // Saat

        if (props.mag < ALERT_MIN_MAG) return false;
        if (timeDiff > ALERT_TIME_LIMIT_HOURS) return false;

        const quakePoint = turf.point(q.geometry.coordinates);
        const dist = turf.distance(userPoint, quakePoint, { units: 'kilometers' });
        q.distToUser = dist; // Sonra kullanmak için sakla

        return dist <= ALERT_RADIUS_KM;
    });

    // En yakını veya en büyüğü göster (Şimdilik En Yakın)
    nearbyQuakes.sort((a, b) => a.distToUser - b.distToUser);

    if (nearbyQuakes.length > 0) {
        const q = nearbyQuakes[0]; // Sadece en önemlisini gösterelim (Spam olmasın)
        showAlertToast(q);
    }
}

function showAlertToast(quake) {
    const container = document.getElementById('alert-container');
    const p = quake.properties;
    const dist = quake.distToUser.toFixed(1);
    const timeText = timeAgo(p.time);

    const toast = document.createElement('div');
    toast.className = 'alert-toast';
    toast.innerHTML = `
        <div style="font-size:1.5rem;">??</div>
        <div class="alert-content">
            <div class="alert-title">
                M ${p.mag.toFixed(1)} Deprem
            </div>
            <div class="alert-body">
                Konumunuza <strong>${dist} km</strong> mesafede, ${timeText}.<br>
                <span style="opacity:0.7">${p.place}</span>
            </div>
        </div>
        <button class="alert-close">×</button>
    `;

    // Kapat Butonu
    toast.querySelector('.alert-close').onclick = () => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    };

    container.appendChild(toast);

    // Otomatik kapanma (Opsiyonel - 10sn)
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }
    }, 15000);
}

// Konum hatası
map.on('locationerror', function (e) {
    let msg = "Konum alınamadı.";
    if (e.message.includes("permission")) {
        msg = "Konum izni verilmedi veya site 'Güvenli Bağlantı' (HTTPS) kullanmıyor. (Telefondan girerken tarayıcılar HTTP sitelerde konumu engeller)";
    } else if (e.code === 1) { // PERMISSION_DENIED
        msg = "Konum erişimine izin vermediniz.";
    } else if (e.code === 2) { // POSITION_UNAVAILABLE
        msg = "Konumunuz tespit edilemiyor (GPS kapalı olabilir).";
    } else if (e.code === 3) { // TIMEOUT
        msg = "Konum bulma zaman aşımına uğradı.";
    }
    alert("Hata: " + msg);
});

let allEarthquakes = [];
let lastFetchTime = 0;
const audioAlert = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');

// Katmanlar
let markersLayer = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 50, // Cluster yapma mesafesi (piksel)
    disableClusteringAtZoom: 9, // [YENİ] Zoom 9 ve sonrasında cluster yapma, tek tek göster
    iconCreateFunction: function (cluster) {
        const markers = cluster.getAllChildMarkers();
        let maxMag = 0;

        // Küme içindeki en büyük depremi bul
        markers.forEach(marker => {
            if (marker.mag && marker.mag > maxMag) {
                maxMag = marker.mag;
            }
        });

        // Sınıf belirle
        let cClass = 'cluster-mag-low';
        if (maxMag >= 6.0) cClass = 'cluster-mag-high';
        else if (maxMag >= 4.0) cClass = 'cluster-mag-medium';

        return L.divIcon({
            html: `<div><span>${cluster.getChildCount()}</span></div>`,
            className: `marker-cluster-custom ${cClass}`,
            iconSize: L.point(40, 40)
        });
    },
    pane: 'earthquakePane' // Z-Index kontrolü için
}).addTo(map);

let latestLayer = L.layerGroup().addTo(map); // Özel tekil katman
let impactLayer = L.layerGroup().addTo(map); // Etki alanı katmanı (Buffer)
let countriesLayer;
let faultsLayer;
let activeCountryPolygon = null;
let turkeyPolygon = null; // Türkiye Sınırı Referansı

// Filtre Durumu
let currentFilters = {
    time: '24h',
    minMag: 0.0,
    countryIso: null
};

let worldFeatures = []; // Tüm ülkelerin poligonlarını tutar

// DOM Elementleri
const quakeListEl = document.getElementById('quake-list');
const lastUpdatedEl = document.getElementById('last-updated');
const totalQuakesEl = document.getElementById('total-quakes');
const magSlider = document.getElementById('mag-slider');
const magValDisplay = document.getElementById('mag-val');

// --- 1. Veri Yükleme ve Katman Yönetimi (TEK SEFERLİK) ---

async function loadLayers() {
    try {
        // A. Ülke Sınırları
        const countriesResp = await fetch('data/countries.geojson');
        const countriesData = await countriesResp.json();

        worldFeatures = countriesData.features; // Global değişkene ata (Analiz için)

        // Türkiye'yi bul ve sakla
        const trFeature = countriesData.features.find(f => f.properties['ISO3166-1-Alpha-2'] === 'TR');
        if (trFeature) {
            turkeyPolygon = trFeature;
            if (allEarthquakes.length > 0) {
                applyFilters();
            }
        }

        // Tıklama Olayı (SADECE ZOOM - FİLTRELEME İPTAL EDİLDİ)
        countriesLayer = L.geoJSON(countriesData, {
            style: {
                color: '#58a6ff',
                weight: 1,
                opacity: 0.5,
                fillColor: '#58a6ff',
                fillOpacity: 0.05
            },
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    // Kullanıcı isteği: Harita tıklaması filtreyi değiştirmesin
                    // Sadece Zoom yapabiliriz veya hiçbir şey yapmayız.
                    // Şimdilik sadece smart zoom yapalım ama filtreyi TETİKLEMEYELİM.
                    const targetBounds = getSmartBounds(feature, layer);
                    map.fitBounds(targetBounds, { padding: [10, 10] });
                });

                layer.on('mouseover', () => {
                    layer.setStyle({ fillOpacity: 0.2, weight: 2 });
                });
                layer.on('mouseout', () => {
                    layer.setStyle({ fillOpacity: 0.05, weight: 1, color: '#58a6ff' });
                });
            }
        }).addTo(map);

        // C. Sidebar Dropdown'ı Doldur
        populateCountrySelect(countriesData);

        // B. Fay Hattı Verileri
        const faultsResp = await fetch('data/gem_active_faults_harmonized.geojson');
        const faultsData = await faultsResp.json();

        // ... (Fay hatları kodu aynı kalıyor - aşağıda)
        faultsLayer = L.geoJSON(faultsData, {
            style: {
                color: '#d29922',
                weight: 1.5,
                opacity: 0.6
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                layer.bindPopup(`
                    <div style="min-width: 150px; font-size: 0.9rem;">
                        <strong style="color: #d29922; display:block; margin-bottom:4px; font-size:1rem;">${p.name || 'Bilinmeyen Fay'}</strong>
                        <div style="margin-bottom: 2px;">
                            <span style="color:#8b949e">Tip:</span> ${p.slip_type || p.fault_type || 'Belirsiz'}
                        </div>
                        <div>
                            <span style="color:#8b949e">Kaynak:</span> ${p.catalog_name || 'GEM'}
                        </div>
                    </div>
                `);
            }
        }).addTo(map);

    } catch (e) {
        console.error("Katman yükleme hatası:", e);
    }
}

// --- 2. Custom Dropdown & Favorites ---
let countryFeaturesMap = {}; // ISO -> Feature mapping
const FAV_STORAGE_KEY = 'udga_fav_iso';

function populateCountrySelect(countriesData) {
    // DOM Elements
    const wrapper = document.getElementById('custom-select-wrapper');
    const trigger = document.getElementById('custom-select-trigger');
    const triggerText = document.getElementById('trigger-text');
    const optionsContainer = document.getElementById('custom-options-container');
    const optionsList = document.getElementById('options-list');
    const searchInput = document.getElementById('country-search');

    // Toggle Dropdown
    trigger.addEventListener('click', () => {
        wrapper.classList.toggle('open');
        if (wrapper.classList.contains('open')) {
            searchInput.focus();
        }
    });

    // Close on Click Outside
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    });

    // Populate List
    const sortedCountries = countriesData.features.sort((a, b) => {
        const nameA = a.properties.name || '';
        const nameB = b.properties.name || '';
        return nameA.localeCompare(nameB);
    });

    // "Tüm Dünyada" seçeneği (Manuel Ekleme)
    const allOption = createOptionElement('ALL', 'Tüm Dünyada', null);
    optionsList.appendChild(allOption);

    sortedCountries.forEach(f => {
        const iso = f.properties['ISO3166-1-Alpha-2'];
        const name = f.properties.name;
        if (iso && name) {
            countryFeaturesMap[iso] = f;
            const item = createOptionElement(iso, name, f);
            optionsList.appendChild(item);
        }
    });

    // Search Logic
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const items = optionsList.querySelectorAll('.custom-option');

        items.forEach(item => {
            const text = item.querySelector('span').innerText.toLowerCase();
            if (text.includes(term)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    });

    // Auto-Select Favorite on Init
    const savedFav = localStorage.getItem(FAV_STORAGE_KEY);
    if (savedFav && countryFeaturesMap[savedFav]) {
        console.log("Favori ülke yüklendi:", savedFav);
        selectCountry(savedFav, countryFeaturesMap[savedFav].properties.name);
    }
}

function createOptionElement(iso, name, feature) {
    const div = document.createElement('div');
    div.className = 'custom-option';
    if (iso === 'ALL') div.classList.add('selected'); // Default
    div.dataset.value = iso;

    // 1. Text
    const textSpan = document.createElement('span');
    textSpan.innerText = name;
    div.appendChild(textSpan);

    // 2. Star Icon (Only for countries, not 'ALL')
    if (iso !== 'ALL') {
        const star = document.createElement('i');
        star.className = 'fav-star';
        star.innerHTML = '★'; // Unicode Star

        // Load initial state
        const savedFav = localStorage.getItem(FAV_STORAGE_KEY);
        if (savedFav === iso) {
            star.classList.add('active');
        }

        // Star Click Event (Toggle Favorite)
        star.addEventListener('click', (e) => {
            e.stopPropagation(); // Don't trigger selection

            const currentFav = localStorage.getItem(FAV_STORAGE_KEY);
            if (currentFav === iso) {
                // Remove
                localStorage.removeItem(FAV_STORAGE_KEY);
                star.classList.remove('active');
                // Diğer tüm yıldızları da temizle (tek favori mantığı)
                document.querySelectorAll('.fav-star').forEach(s => s.classList.remove('active'));
            } else {
                // Add (and replace existing)
                localStorage.setItem(FAV_STORAGE_KEY, iso);
                // Reset others
                document.querySelectorAll('.fav-star').forEach(s => s.classList.remove('active'));
                star.classList.add('active');
            }
        });

        div.appendChild(star);
    }

    // Option Click Event (Select Country)
    div.addEventListener('click', () => {
        selectCountry(iso, name);
        // UI Feedback
        document.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
        div.classList.add('selected');
        // Close dropdown
        document.getElementById('custom-select-wrapper').classList.remove('open');
    });

    return div;
}

function selectCountry(iso, name) {
    const triggerText = document.getElementById('trigger-text');
    triggerText.innerText = name;

    const val = iso === 'ALL' ? null : iso;

    // Harita Mantığı (Eski kodla aynı)
    countriesLayer.resetStyle();

    if (val && countryFeaturesMap[val]) {
        const feat = countryFeaturesMap[val];
        activeCountryPolygon = feat;

        if (countriesLayer) {
            countriesLayer.eachLayer(layer => {
                if (layer.feature === feat) {
                    layer.setStyle({ fillOpacity: 0.3, weight: 2, color: '#fff', fillColor: '#58a6ff' });
                    layer.bringToFront();
                }
            });
        }

        const tempLayer = L.geoJSON(feat);
        const targetBounds = getSmartBounds(feat, tempLayer);
        map.fitBounds(targetBounds, { padding: [10, 10] });
    } else {
        activeCountryPolygon = null;
        map.setView([39.9334, 32.8597], 6);
    }

    applyFilters();
}

// --- 2. Ülke Seçimi (Smart Zoom Logic) ---
// getSmartBounds fonksiyonu aynı kalıyor...
function getSmartBounds(feature, layer) {
    let bounds = layer.getBounds();

    if (feature.geometry.type.toLowerCase() === 'multipolygon') {
        try {
            let maxArea = 0;
            let maxPolyCoords = null;

            feature.geometry.coordinates.forEach(coords => {
                const poly = turf.polygon(coords);
                const area = turf.area(poly);
                if (area > maxArea) {
                    maxArea = area;
                    maxPolyCoords = coords;
                }
            });

            if (maxPolyCoords) {
                const outerRing = maxPolyCoords[0];
                const lats = outerRing.map(c => c[1]);
                const lngs = outerRing.map(c => c[0]);

                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);
                const minLng = Math.min(...lngs);
                const maxLng = Math.max(...lngs);

                const smartBounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
                if (smartBounds.isValid()) {
                    bounds = smartBounds;
                }
            }
        } catch (e) {
            console.warn('Smart bounds hatası:', e);
        }
    }
    return bounds;
}

// Eski handleCountryClick fonksiyonuna artık ihtiyacımız yok veya boşaltabiliriz.
function handleCountryClick(feature, layer) {
    // İPTAL EDİLDİ - Harita tıklaması filtreyi etkilemiyor.
}

// --- 3. Filtreleme ---

// --- 3. Filtreleme ---

function applyFilters() {
    const now = Date.now();

    // 1. Temel Filtreler (Zaman ve Büyüklük)
    const filtered = allEarthquakes.filter(q => {
        const mag = q.properties.mag;
        const time = q.properties.time;

        // Zaman Filtresi
        const hours = currentFilters.time === '24h' ? 24 : (currentFilters.time === '7d' ? 168 : 720); // 30d = 720h
        const cutoff = Date.now() - hours * 3600 * 1000;
        if (currentFilters.time === '1h') {
            if ((now - time) > 3600000) return false;
        } else {
            if (time < cutoff) return false;
        }

        // Büyüklük Filtresi
        if (mag < currentFilters.minMag) return false;

        return true;
    });

    // 1. Harita için Global Veri (Filtrelenmiş Zaman/Büyüklük) -> HER ZAMAN HEPSİ
    const mapData = filtered;

    // 2. Liste için Lokal Veri (Varsa Ülke Filtresi)
    let listData = filtered;

    // Eğer bir ülke seçiliyse:
    // KURAL: Seçili ülke içindekiler + DENİZDEKİLER (Hiçbir ülkede olmayanlar)
    // HARİÇ TUTULAN: Başka bir ülkenin karasında olanlar
    if (activeCountryPolygon) {
        listData = filtered.filter(q => {
            // 1. Seçili ülkede mi?
            const pt = turf.point(q.geometry.coordinates);
            const inSelected = turf.booleanPointInPolygon(pt, activeCountryPolygon);

            // 2. Denizde mi? (Daha önce hesaplanan isLand flag'i false ise)
            // Not: q.properties.isLand özelliği fetchEarthquakes'te hesaplanacak.
            // Eğer henüz hesaplanmadıysa (ilk yükleme vs) varsayılan olarak deniz sayalım ki kaybolmasın.
            const isSea = (q.properties.isLand === false);

            return inSelected || isSea;
        });
    }

    updateMap(mapData);
    updateSidebar(listData);
}

// --- 4. Harita Marker ve UI ---

function getMagColor(mag) {
    if (mag >= 7.0) return '#550000'; // Çok Yıkıcı (Koyu Bordo)
    if (mag >= 6.0) return '#a80000'; // Yıkıcı (Kırmızı)
    if (mag >= 5.0) return '#ff0000'; // Şiddetli (Açık Kırmızı)
    if (mag >= 4.0) return '#ff8c00'; // Orta (Turuncu)
    if (mag >= 3.0) return '#ffd700'; // Hafif (Sarı)
    return '#1e90ff'; // Küçük (Mavi)
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${seconds} sn önce`;
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `${minutes} dk önce` : `${Math.floor(minutes / 60)} saat önce`;
}

function createMarker(feature, isNew = false, isLatest = false) {
    const coords = feature.geometry.coordinates;
    const props = feature.properties;

    const color = getMagColor(props.mag);

    // 1. Görsel Boyut Hesaplama (DAHA BÜYÜK - Mobil Dostu)
    const dotSize = Math.max(props.mag * 5, 12);

    // 2. Hit Area (Tıklama Alanı) - Daha Geniş
    const hitSize = 60;

    // Marker Olayları (Zoom Fix)
    function setupMarkerEvents(m, feature) {
        m.on('click', () => {
            // Aşama 1: Harita Odaklanma (Zoom/FlyTo)
            const currentZoom = map.getZoom();
            const targetZoom = Math.max(currentZoom, 9);

            map.flyTo([coords[1], coords[0]], targetZoom, {
                animate: true,
                duration: 1.2
            });
        });

        // Popup İçeriği
        const popupContent = document.createElement('div');
        popupContent.style.minWidth = "180px";

        popupContent.innerHTML = `
            <h3 style="color:${color}; margin-bottom:5px;">M ${props.mag.toFixed(1)}</h3>
            <strong>${props.place}</strong><br>
            <span style="font-size:0.85em; color:#888">
                ${new Date(props.time).toLocaleString('tr-TR')}
                <br>Derinlik: ${coords[2]} km
                <br><span style="color: ${props.source === 'Kandilli' ? '#d29922' : '#58a6ff'}">Kaynak: ${props.source || 'USGS'}</span>
            </span>
        `;

        // Buton Ekle
        const btn = document.createElement('button');
        btn.className = 'impact-btn';
        btn.innerHTML = '⭕ Tahmini Etki Alanı';
        btn.onclick = (e) => {
            e.stopPropagation();
            // Marker'ın kendisini de gönderiyoruz ki cluster'dan çıkarabilelim
            toggleImpactZone(feature, btn, m);
        };

        popupContent.appendChild(btn);
        m.bindPopup(popupContent, {
            autoPan: true,
            closeOnClick: false, // Harita tıklamasında kapanmasın
            autoClose: false     // Başka popup açılınca kapanmasın (istenirse true kalabilir ama persistence için false iyi)
        });
    }

    // A. EN SON DEPREM (Fix: Geri Eklendi!)
    if (isLatest) {
        // Latest için özel divIcon (Pulse Ring)
        const pulseIcon = L.divIcon({
            className: 'quake-marker-container',
            html: `<div class="pulse-ring" style="
                width: 24px; 
                height: 24px; 
            "></div>`,
            iconSize: [hitSize, hitSize],
            iconAnchor: [hitSize / 2, hitSize / 2],
            popupAnchor: [0, -12]
        });

        const marker = L.marker([coords[1], coords[0]], {
            icon: pulseIcon,
            pane: 'latestPane',
            interactive: true
        });
        setupMarkerEvents(marker, feature);
        return marker;
    }

    // B. STANDART DEPREM
    const standardIcon = L.divIcon({
        className: 'quake-marker-container',
        html: `<div class="quake-dot" style="
            width: ${dotSize}px; 
            height: ${dotSize}px; 
            background-color: ${color};
        "></div>`,
        iconSize: [hitSize, hitSize],
        iconAnchor: [hitSize / 2, hitSize / 2],
        popupAnchor: [0, -(dotSize / 2)]
    });

    const marker = L.marker([coords[1], coords[0]], {
        icon: standardIcon,
        pane: 'earthquakePane',
        mag: props.mag
    });

    if (isNew) {
        marker.setIcon(L.divIcon({
            className: 'quake-marker-container',
            html: `<div class="quake-dot new-quake-alert" style="
                width: ${dotSize}px; 
                height: ${dotSize}px; 
                background-color: ${color};
            "></div>`,
            iconSize: [hitSize, hitSize],
            iconAnchor: [hitSize / 2, hitSize / 2],
            popupAnchor: [0, -(dotSize / 2)]
        }));
    }

    setupMarkerEvents(marker, feature);
    return marker;
}

// --- Etki Alanı (Buffer) Yönetimi ---
let activeImpactId = null;
let activeMarkerInstance = null; // Cluster'dan çıkarılan marker'ı tutar

function toggleImpactZone(feature, btnElement, markerInstance) {
    const id = feature.properties.code || feature.id || feature.properties.time;

    // Durum 1: Kapat (Aynı depreme tıklandı)
    if (activeImpactId === id) {
        impactLayer.clearLayers();
        activeImpactId = null;

        // Marker'ı Cluster'a geri ver
        if (activeMarkerInstance) {
            // Önce haritadan sil (sanki cluster yutmuş gibi)
            activeMarkerInstance.removeFrom(map);
            // Cluster grubuna geri ekle
            markersLayer.addLayer(activeMarkerInstance);
            activeMarkerInstance = null;
        }

        if (btnElement) {
            btnElement.classList.remove('active');
            btnElement.innerHTML = '⭕ Tahmini Etki Alanı';
        }
        return;
    }

    // Durum 2: Yeni Bir Deprem Açılıyor

    // A. Önceki açıksa temizle ve markerını yerine koy
    if (activeImpactId !== null && activeMarkerInstance) {
        impactLayer.clearLayers();
        activeMarkerInstance.removeFrom(map);
        markersLayer.addLayer(activeMarkerInstance);
        activeMarkerInstance = null;
        // Not: Önceki butonun metnini değiştiremiyoruz çünkü btnElement yeni buton. 
        // Ancak popup kapandığı için çok sorun değil, yeniden açılınca resetlenir.
    }

    // B. Yeni Etki Alanını Çiz
    if (btnElement) {
        btnElement.classList.add('active');
        btnElement.innerHTML = 'Kapat';
    }

    // C. Marker Yönetimi: Cluster'dan Çıkar -> Haritaya Ekle (Böylece zoom out'ta kaybolmaz)
    // Sadece "normal" cluster markerları için bu işlemi yapmalıyız. 
    // "Latest" deprem zaten 'latestPane' üzerinde ve cluster'da değil, ona dokunmaya gerek yok.
    // Ancak `markerInstance` her durumda geliyor.

    // Eğer marker zaten cluster grubundaysa (yani normal markersch)
    if (markersLayer.hasLayer(markerInstance)) {
        markersLayer.removeLayer(markerInstance); // Cluster'dan çıkar
        markerInstance.addTo(map); // Doğrudan haritaya ekle
        markerInstance.openPopup(); // Aktarma sırasında popup kapanabilir, tekrar aç
        activeMarkerInstance = markerInstance; // Kaydet
    }

    // D. Buffer Hesapla (Turf.js)
    const mag = feature.properties.mag;
    const radiusKm = Math.pow(2, mag) * 1.5;

    const center = feature.geometry.coordinates;
    const bufferPoly = turf.circle(center, radiusKm, {
        steps: 64,
        units: 'kilometers'
    });

    const layer = L.geoJSON(bufferPoly, {
        style: {
            color: '#f85149',
            weight: 2,
            opacity: 0.8,
            fillColor: '#f85149',
            fillOpacity: 0.2,
            className: 'impact-buffer-anim'
        },
        pane: 'impactPane', // ARTIK EN ALTTA!
        interactive: false  // TIKLAMALARI GEÇİR (Map panning ve alttaki markerlar çalışsın)
    });

    impactLayer.addLayer(layer);
    activeImpactId = id;

    // C. Ekrana Sığdır (Smart Zoom)
    const bounds = layer.getBounds();
    map.fitBounds(bounds, {
        paddingTopLeft: [20, 150],
        paddingBottomRight: [20, 20],
        maxZoom: 12,
        animate: true,
        duration: 1.0
    });
}

function updateMap(quakes) {
    markersLayer.clearLayers();
    latestLayer.clearLayers();

    // 1. Türkiye içindeki EN YENİ depremi bul
    let latestTrQuake = null;

    if (turkeyPolygon) {
        // Zamanı en büyük (en yeni) olan ve TR içinde olanı ara
        // quakes zaten zamana göre sıralı
        for (const q of quakes) {
            const point = turf.point(q.geometry.coordinates);
            if (turf.booleanPointInPolygon(point, turkeyPolygon)) {
                latestTrQuake = q;
                break;
            }
        }
    }

    // 2. Markerları ekle
    quakes.forEach(q => {
        // Eğer bu "En Son" depremse, Cluster'a değil, Latest Layer'a ekle
        if (latestTrQuake && q === latestTrQuake) {
            latestLayer.addLayer(createMarker(q, false, true));

            // İLK YÜKLEMEDE haritayı oraya odakla (Kullanıcı etkileşimi olmadan)
            if (activeCountryPolygon === null && lastFetchTime === 0) {
                map.flyTo([q.geometry.coordinates[1], q.geometry.coordinates[0]], 7, {
                    animate: true,
                    duration: 1.5
                });
            }
        } else {
            // Normal deprem -> Cluster
            markersLayer.addLayer(createMarker(q));
        }
    });
}

function updateSidebar(quakes) {
    quakeListEl.innerHTML = '';
    totalQuakesEl.innerText = quakes.length;

    quakes.slice(0, 50).forEach(quake => {
        const props = quake.properties;
        const color = getMagColor(props.mag);

        const item = document.createElement('div');
        item.className = 'quake-item';
        item.innerHTML = `
            <div class="quake-mag" style="background-color: ${color}">${props.mag.toFixed(1)}</div>
            <div class="quake-info">
                <div class="quake-loc">${props.place}</div>
                <div class="quake-time">${timeAgo(props.time)} • ${quake.geometry.coordinates[2]}km</div>
            </div>
        `;

        item.onclick = () => {
            const coords = quake.geometry.coordinates;
            // Harita tıklaması değil, panel tıklaması -> FlyTo güvenli
            map.flyTo([coords[1], coords[0]], 10);
        };

        quakeListEl.appendChild(item);
    });
}

// --- 5. Data Fetching ---

// --- 5. Data Fetching ---

async function fetchEarthquakes() {
    // A. Ülke Sınırları (Sadece bir kez yükle)
    // worldFeatures loadLayers() içinde yükleniyor.

    try {
        const response = await fetch('/api/earthquakes');
        const data = await response.json();

        if (data.success && data.data.features) {
            const features = data.data.features;

            if (lastFetchTime > 0) {
                const newQuakes = features.filter(f => f.properties.time > lastFetchTime);
                if (newQuakes.some(f => f.properties.mag >= 4.0)) {
                    audioAlert.play().catch(() => { });
                }
            }

            // [YENİ] Kara/Deniz Analizi (SERVER-SIDE)
            // Backend (server.js) artık veriyi hesaplayıp 'isLand' property'si ile gönderiyor.
            // Client tarafında herhangi bir işlem yapmaya gerek kalmadı.
            // Sadece veri geldiğinde UI'a yansıtıyoruz. (Sıfır Donma)

            allEarthquakes = features;
            lastFetchTime = Date.now();
            lastUpdatedEl.innerText = new Date().toLocaleTimeString('tr-TR');

            applyFilters();
        }
    } catch (error) {
        console.error('Veri hatası:', error);
    }
}

// --- 6. Tarihi Depremler (Eğitim Modülü) ---
let historyLayer = L.layerGroup(); // Global

// [YENİ] Tarihi Depremler için ÜST KATMAN
map.createPane('historyPane');
map.getPane('historyPane').style.zIndex = 750;
map.getPane('historyPane').style.pointerEvents = 'none';

// [YENİ] Tarihi Depremler için Buffer Katmanı
// Markerların altında ama haritanın üzerinde olsun (historyPane markerlar için, bu buffer için)
map.createPane('historyImpactPane');
map.getPane('historyImpactPane').style.zIndex = 460; // ImpactPane(450) üstü
map.getPane('historyImpactPane').style.pointerEvents = 'none';

let historyImpactLayer = L.layerGroup().addTo(map); // Bufferları tutacak
let activeHistoryImpactId = null;

async function loadHistoryData() {
    console.log("DEBUG: Tarihi veriler yükleniyor...");
    try {
        // Cache-busting ekle
        const resp = await fetch('data/history.json?t=' + Date.now());
        const data = await resp.json();

        console.log(`DEBUG: ${data.length} adet deprem verisi çekildi.`);
        historyLayer.clearLayers();

        data.forEach((item, index) => {
            try {
                // Güvenlik kontrolleri
                if (!item.lat || !item.lng) {
                    console.warn(`WARN: Satır ${index} (${item.name}) eksik koordinat.`);
                    return;
                }

                const icon = L.divIcon({
                    className: 'history-marker',
                    html: `
                        <div style="
                            background: #4a148c;
                            color: white;
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border: 2px solid white;
                            box-shadow: 0 4px 8px rgba(0,0,0,0.4);
                        ">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                        </div>
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                    popupAnchor: [0, -20]
                });

                const marker = L.marker([item.lat, item.lng], {
                    icon: icon,
                    pane: 'historyPane'
                });

                // Benzersiz ID oluştur
                const uniqueId = (item.name || 'quake_' + index).replace(/[^a-zA-Z0-9]/g, '_');
                item.id = uniqueId;

                // Popup İçeriği (Profesyonel Dark Mode Tasarım)
                const btnId = `btn-hist-${uniqueId}`;

                const timeDisplay = item.time
                    ? `<span style="color:#e0e0e0;">${item.time}</span>`
                    : `<span style="color:#888; font-style:italic;">Saat bilgisi yok</span>`;

                const depthDisplay = item.depth
                    ? `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                         <span style="color:#aaa;">Derinlik:</span>
                         <span style="color:#fff; font-weight:500;">${item.depth} km</span>
                       </div>`
                    : `<div style="margin-bottom:4px; color:#888; font-style:italic;">Derinlik bilgisi yok</div>`;

                const popupContent = document.createElement('div');
                popupContent.style.minWidth = "240px";
                popupContent.style.fontFamily = "'Inter', sans-serif";

                popupContent.innerHTML = `
                    <div style="border-bottom: 1px solid #444; padding-bottom: 8px; margin-bottom: 10px;">
                        <h3 style="color:#d1c4e9; margin:0; font-size:1.1rem; font-weight:600;">${item.name}</h3>
                    </div>
                    
                    <div style="font-size:0.9rem; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span style="color:#aaa;">Tarih:</span>
                            <span style="color:#fff; font-weight:500;">${item.date} ${timeDisplay}</span>
                        </div>
                        ${depthDisplay}
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px; align-items:center;">
                             <span style="color:#aaa;">Büyüklük:</span>
                             <span style="background:#6a1b9a; color:white; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:0.95rem;">M ${item.mag}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                             <span style="color:#aaa;">Etki Yarıçapı:</span>
                             <span style="color:#fff;">${item.radius ? item.radius + ' km' : 'Bilinmiyor'}</span>
                        </div>
                         <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                             <span style="color:#aaa;">Can Kaybı:</span>
                             <span style="color:#ff5252; font-weight:bold;">${item.deaths}</span>
                        </div>
                    </div>

                    <div style="background:#2d333b; padding:10px; border-radius:6px; margin-bottom:12px; border-left: 3px solid #6a1b9a;">
                        <p style="font-size:0.85rem; line-height:1.5; color:#ccc; margin:0;">
                            ${item.description}
                        </p>
                    </div>

                    ${item.radius ?
                        `<button id="${btnId}" class="impact-btn" style="
                            width: 100%;
                            background: #6a1b9a; 
                            color: white; 
                            border: none; 
                            padding: 10px; 
                            border-radius: 6px; 
                            cursor: pointer; 
                            font-weight: 600; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            gap: 8px;
                            transition: background 0.2s;
                        ">
                            <span>🌐</span> Etki Alanını Göster
                        </button>`
                        : ''}
                `;

                // Button Listener
                const btn = popupContent.querySelector(`#${btnId}`);
                if (btn) {
                    btn.onmouseover = () => btn.style.background = '#7b1fa2'; // Hover effect
                    btn.onmouseout = () => btn.style.background = btn.classList.contains('active') ? '#d32f2f' : '#6a1b9a';

                    btn.onclick = (e) => {
                        e.stopPropagation();
                        toggleHistoryImpact(item, btn);
                    }
                }

                marker.bindPopup(popupContent, {
                    autoClose: false,
                    className: 'dark-popup' // Stil dosyasında varsa, yoksa default dark iyidir
                });

                historyLayer.addLayer(marker);

            } catch (errLoop) {
                console.error(`ERROR: Satır ${index} işlenirken hata:`, errLoop);
            }
        });

        // Katmanı haritaya ekle (eğer zaten ekli değilse)
        // ... (Bu kısım _createToggle içinde hallediliyor)

        // [FIX] Kullanıcı tüm dünyadaki noktaları görsün diye kamerayı ayarla
        if (historyLayer.getLayers().length > 0) {
            const group = L.featureGroup(historyLayer.getLayers());
            map.fitBounds(group.getBounds(), { padding: [50, 50] });
        }

    } catch (e) {
        console.error("Tarihi veri yüklenemedi:", e);
    }
}

function toggleHistoryImpact(item, btnElement) {
    // 1. Durum Kontrolü (Açık mı?)
    if (activeHistoryImpactId === item.id) {
        // Kapat
        historyImpactLayer.clearLayers();
        activeHistoryImpactId = null;
        if (btnElement) {
            btnElement.innerHTML = '<span>🌐</span> Etki Alanını Göster';
            btnElement.style.background = '#6a1b9a'; // Reset color
            btnElement.classList.remove('active');
        }
    } else {
        // Aç (Öncekini temizle)
        historyImpactLayer.clearLayers();

        // Yeni çiz
        const center = [item.lng, item.lat]; // Turf [lng, lat] ister
        const radius = item.radius || 50;

        const circlePoly = turf.circle(center, radius, {
            steps: 64,
            units: 'kilometers'
        });

        const layer = L.geoJSON(circlePoly, {
            style: {
                color: '#ab47bc', // Daha açık mor (Dark modda iyi görünür)
                weight: 2,
                opacity: 1,
                fillColor: '#8e24aa',
                fillOpacity: 0.25,
                className: 'impact-buffer-anim' // Animasyon CSS'i
            },
            pane: 'historyImpactPane',
            interactive: false
        });

        historyImpactLayer.addLayer(layer);

        // State Güncelle
        activeHistoryImpactId = item.id;
        if (btnElement) {
            // [YENİ] Zoom Efekti (İstek üzerine)
            map.flyToBounds(layer.getBounds(), {
                padding: [50, 50],
                duration: 1.5, // Sinematik yavaşlık
                animate: true
            });
        }
    }
}

// [YENÄ°] SimÃ¼lasyon KatmanÄ± (En Ã¼stte)
map.createPane('simulationPane');
map.getPane('simulationPane').style.zIndex = 900; // En Ã¼st (Latest'in bile Ã¼stÃ¼)
map.getPane('simulationPane').style.pointerEvents = 'none';

let simulationLayer = L.layerGroup().addTo(map);
let isSimulationMode = false;
let tempSimMarker = null;

// Buton KontrolÃ¼ (Top-Left)
const SimulationControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.style.backgroundColor = 'white';
        container.style.padding = '5px 10px';
        container.style.cursor = 'pointer';
        container.style.fontWeight = 'bold';
        container.style.fontSize = '14px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.height = 'auto'; // Allow height to grow
        container.style.minWidth = '50px'; // Ensure enough width
        container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg><span style="font-size:10px; margin-top:2px; line-height:1;">Simüle Et</span>`;

        container.onclick = function () {
            toggleSimulationMode(this);
        }
        return container;
    }
});
map.addControl(new SimulationControl());

function toggleSimulationMode(btn) {
    isSimulationMode = !isSimulationMode;

    if (isSimulationMode) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span style="font-size:10px; margin-top:2px; line-height:1;">Kapat</span>`;
        btn.style.color = 'red';
        map.getContainer().style.cursor = 'crosshair';

        // Kullanıcıya bilgi ver
        map.openPopup('<b>🧪 Simülasyon Modu:</b><br>Haritada bir noktaya tıklayın.', map.getCenter());
    } else {
        resetSimulation(btn);
    }
}

function resetSimulation(btn) {
    isSimulationMode = false;
    if (btn) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg><span style="font-size:10px; margin-top:2px; line-height:1;">Simüle Et</span>`;
        btn.style.color = 'black';
    }
    map.getContainer().style.cursor = '';
    simulationLayer.clearLayers();
    if (tempSimMarker) map.removeLayer(tempSimMarker);
    tempSimMarker = null;
    map.closePopup();
}

// Harita TÄ±klama Dinleyicisi
map.on('click', function (e) {
    if (!isSimulationMode) return;

    // Ã–nceki simÃ¼lasyonu temizle
    simulationLayer.clearLayers();
    if (tempSimMarker) map.removeLayer(tempSimMarker);

    const latlng = e.latlng;

    // 1. NoktayÄ± Ä°ÅŸaretle
    tempSimMarker = L.marker(latlng, {
        draggable: true
    }).addTo(map);

    // 2. Paneli AÃ§ (Popup Olarak)
    const container = document.createElement('div');
    container.style.minWidth = '250px';
    container.innerHTML = `
        <h3 style="margin:0 0 10px 0; color:#4a148c; border-bottom:1px solid #ccc; padding-bottom:5px;">Simülasyon Ayarları</h3>
        
        <label style="display:block; margin-bottom:5px; font-weight:bold;">Büyüklük: <span id="sim-mag-val">5.0</span></label>
        <input type="range" id="sim-mag-range" min="0.0" max="10.0" step="0.1" value="5.0" style="width:100%; margin-bottom:15px;">
        
        <button id="sim-calc-btn" style="width:100%; padding:8px; background:#4a148c; color:white; border:none; border-radius:4px; cursor:pointer;">Hesapla ve Çiz</button>
        <button id="sim-clear-btn" style="width:100%; padding:5px; background:#ddd; color:#333; border:none; border-radius:4px; cursor:pointer; margin-top:5px;">Temizle</button>
    `;

    const popup = L.popup({ minWidth: 260 })
        .setLatLng(latlng)
        .setContent(container)
        .openOn(map);

    // Event Listeners (DOM oluÅŸtuktan sonra)

    // Range Listener
    const range = container.querySelector('#sim-mag-range');
    const valSpan = container.querySelector('#sim-mag-val');
    range.oninput = () => {
        valSpan.innerText = parseFloat(range.value).toFixed(1);
    };

    // Hesapla Butonu
    container.querySelector('#sim-calc-btn').onclick = () => {
        runSimulation(latlng, parseFloat(range.value));
    };

    // Temizle Butonu
    container.querySelector('#sim-clear-btn').onclick = () => {
        simulationLayer.clearLayers();
        if (tempSimMarker) map.removeLayer(tempSimMarker);
        map.closePopup();
    };
});

function runSimulation(center, mag) {
    // Kurallar
    // < 3: 5km (Green)
    // 3-4: 5:10km (Light Green)
    // 4-5: 10-25km (Yellow)
    // 5-6: 25-60km (Orange)
    // 6-7: 60-120km (Red)
    // 7-8: 120-250km (Dark Red)
    // 8-9: 250-500km (Purple)
    // > 9: 500-1000km (Black)

    let radiusKm = 5; // Default <3
    let color = '#4caf50'; // Green

    if (mag >= 3 && mag < 4) {
        radiusKm = 5 + (mag - 3) * 5; // 5 -> 10
        color = '#8bc34a'; // Light Green
    } else if (mag >= 4 && mag < 5) {
        radiusKm = 10 + (mag - 4) * 15; // 10 -> 25
        color = '#ffd700'; // Yellow
    } else if (mag >= 5 && mag < 6) {
        radiusKm = 25 + (mag - 5) * 35; // 25 -> 60
        color = '#ff9800'; // Orange
    } else if (mag >= 6 && mag < 7) {
        radiusKm = 60 + (mag - 6) * 60; // 60 -> 120
        color = '#f44336'; // Red
    } else if (mag >= 7 && mag < 8) {
        radiusKm = 120 + (mag - 7) * 130; // 120 -> 250
        color = '#b71c1c'; // Dark Red
    } else if (mag >= 8 && mag < 9) {
        radiusKm = 250 + (mag - 8) * 250; // 250 -> 500
        color = '#9c27b0'; // Purple
    } else if (mag >= 9) {
        radiusKm = 500 + (mag - 9) * 500; // 500 -> 1000 (cap at 1000?)
        if (radiusKm > 1000) radiusKm = 1000;
        color = '#000000'; // Black
    }

    // Buffer Ã‡iz
    const turfCenter = [center.lng, center.lat];
    const circle = turf.circle(turfCenter, radiusKm, { steps: 64, units: 'kilometers' });

    simulationLayer.clearLayers(); // Eskisini sil

    const layer = L.geoJSON(circle, {
        style: {
            color: color,
            weight: 2,
            opacity: 1,
            fillColor: color,
            fillOpacity: 0.3,
            className: 'impact-buffer-anim'
        },
        pane: 'simulationPane'
    }).addTo(simulationLayer);

    // Animasyonlu Zoom
    map.flyToBounds(layer.getBounds(), { padding: [50, 50], duration: 1.0 });
}
console.log('App starting...');
loadLayers().then(() => {
    console.log('Layers loaded, fetching quakes...');
    fetchEarthquakes();
    setInterval(fetchEarthquakes, 20000);
}).catch(err => {
    console.error('Initialization error:', err);
    // Hata olsa bile depremleri çekmeyi dene
    fetchEarthquakes();
    setInterval(fetchEarthquakes, 20000);
});

// UI Events
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const filterType = e.target.dataset.filter;
        if (['1h', '24h', '7d', '30d'].includes(filterType)) {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilters.time = filterType;
            applyFilters();
        }
    });
});

magSlider.addEventListener('input', (e) => {
    magValDisplay.innerText = parseFloat(e.target.value).toFixed(1);
    currentFilters.minMag = parseFloat(e.target.value);
    applyFilters();
});

document.getElementById('mobile-toggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
});

// Filtre Paneli Toggle Logic
const filterHeader = document.getElementById('filter-header');
const filterPanel = document.getElementById('filter-panel');
if (filterHeader && filterPanel) {
    // Mobilde varsayılan kapalı, masaüstünde isteğe bağlı (şimdilik kapalı başlasın temiz kalsın)
    filterHeader.addEventListener('click', () => {
        filterPanel.classList.toggle('open');
    });

    // Uygulama açılışında: Mobilde kapalı, masaüstünde açık olabilir.
    // Şimdilik temiz görünüm için kapalı başlatıyoruz.
    // filterPanel.classList.add('open'); 
}


// --- Welcome Modal Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const modalOverlay = document.getElementById('welcome-modal-overlay');
    const closeBtn = document.getElementById('modal-close-btn');
    const startBtn = document.getElementById('modal-start-btn');
    const dontShowCheckbox = document.getElementById('dont-show-again');

    const STORAGE_KEY = 'udga_welcome_hidden';

    // Check if user has opted to hide the modal
    const shouldHide = localStorage.getItem(STORAGE_KEY) === 'true';

    if (!shouldHide) {
        setTimeout(() => {
            if (modalOverlay) {
                modalOverlay.classList.add('active');
            }
        }, 500);
    } else {
        // If hidden, remove from DOM to save resources (optional but good practice)
        if (modalOverlay) modalOverlay.style.display = 'none';
    }

    function closeModal() {
        if (modalOverlay) {
            modalOverlay.classList.remove('active');

            // Check checkbox status
            if (dontShowCheckbox && dontShowCheckbox.checked) {
                localStorage.setItem(STORAGE_KEY, 'true');
                console.log('Welcome modal hidden permanently by user.');
            }
        }
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (startBtn) startBtn.addEventListener('click', closeModal);

    // Close on click outside (background)
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
    }
});
