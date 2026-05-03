let citiesData = [];
let legendData = [];
let currentCity = null;
let currentRound = 1;
const maxRounds = 5;
let sessionScore = 0;
let gameOver = false;
let roundId = 0;
let sessionHistory = [];
let roundLoaded = false;

// Global Unit Preference
let currentUnits = localStorage.getItem('site_units') || 'metric';

/**
 * UTILITY: GET CONTRAST COLOR (Black or White)
 */
function getContrastColor(hex) {
    return '#000';
}

/**
 * INITIALIZATION
 */
async function start() {
    try {
        const [cResp, lResp] = await Promise.all([
            fetch('../cities.json'),
            fetch('../legend.json')
        ]);
        const allCities = await cResp.json();
        legendData = await lResp.json();

        citiesData = allCities.filter(c => c.zone > 0);

        setupInteraction();
        loadRound();
        syncUnitUI();
        updateScoreDisplay(); // Fix 0 KM init bug

        const handleNext = () => {
            if (gameOver) return; // Prevent double execution mapping to location.reload()

            const overlay = document.getElementById('feedback-overlay');
            if (currentRound < maxRounds) {
                currentRound++;
                overlay.classList.add('hidden');
                loadRound();
            } else {
                gameOver = true;
                overlay.classList.remove('hidden');
                showFinalResults();
            }
        };

        const modalBtn = document.getElementById('modal-btn');
        modalBtn.onclick = handleNext;

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const overlay = document.getElementById('feedback-overlay');
                if (!overlay.classList.contains('hidden')) {
                    handleNext();
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        });

        document.getElementById('unit-toggle').onclick = () => {
            currentUnits = currentUnits === 'metric' ? 'imperial' : 'metric';
            localStorage.setItem('site_units', currentUnits);
            syncUnitUI();
            updateScoreDisplay();
        };

    } catch (e) { console.error("Crash:", e); }
}

function syncUnitUI() {
    document.getElementById('unit-metric').classList.toggle('active', currentUnits === 'metric');
    document.getElementById('unit-imperial').classList.toggle('active', currentUnits === 'imperial');
}

function updateScoreDisplay() {
    const displayDist = Math.round(currentUnits === 'metric' ? sessionScore : sessionScore * 0.621371);
    const unitLabel = currentUnits === 'metric' ? 'KM' : 'MI';
    document.getElementById('session-score').textContent = `${displayDist} ${unitLabel}`;
}


let panorama = null;
let svService = null;
let lockedPanoId = null;

// Called by Google Maps API once loaded
window.initStreetView = function () {
    svService = new google.maps.StreetViewService();
    panorama = new google.maps.StreetViewPanorama(
        document.getElementById('streetview-pano'),
        {
            disableDefaultUI: true,
            showRoadLabels: false,
            clickToGo: false,
            scrollwheel: true,
            panControl: false,
            zoomControl: false,
            fullscreenControl: false,
            addressControl: false,
            linksControl: false,
            motionTracking: false,
            motionTrackingControl: false,
        }
    );

    // Snap back to locked pano if anything tries to move it
    panorama.addListener('pano_changed', () => {
        if (lockedPanoId && panorama.getPano() !== lockedPanoId) {
            panorama.setPano(lockedPanoId);
        }
    });
};

/**
 * LOAD ROUND — Street View
 */
async function loadRound() {
    const loader = document.getElementById('load-curtain');
    loader.classList.remove('hidden');
    roundLoaded = false;

    // Wait for Google Maps API to initialise if not ready yet
    let waitMs = 0;
    while (!svService && waitMs < 10000) {
        await new Promise(r => setTimeout(r, 100));
        waitMs += 100;
    }
    if (!svService) return; // API failed to load

    const pool = citiesData.filter(c => (c.population || 0) > 400000);
    const thisRoundId = ++roundId;
    let found = false;
    let attempts = 0;

    while (!found && attempts < 80) {
        attempts++;
        if (thisRoundId !== roundId) return;

        const draft = pool[Math.floor(Math.random() * pool.length)];

        // Add random offset up to ~5km so we don't always land at exact city centre
        const latOffset = (Math.random() - 0.5) * 0.08;
        const lngOffset = (Math.random() - 0.5) * 0.08;
        const searchLat = draft.lat + latOffset;
        const searchLng = draft.lng + lngOffset;

        try {
            const result = await new Promise((resolve) => {
                svService.getPanorama(
                    { location: { lat: searchLat, lng: searchLng }, radius: 5000, source: google.maps.StreetViewSource.OUTDOOR },
                    (data, status) => resolve({ data, status })
                );
            });

            if (result.status === google.maps.StreetViewStatus.OK && thisRoundId === roundId) {
                lockedPanoId = result.data.location.pano;
                panorama.setPano(lockedPanoId);
                panorama.setVisible(true);
                currentCity = draft;
                loader.classList.add('hidden');
                document.getElementById('round-indicator').textContent = `ROUND ${currentRound}/${maxRounds}`;
                roundLoaded = true;
                found = true;
            }
        } catch (e) { }
    }
}

/**
 * GEOGRAPHIC SCORING
 */
function getDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestWithZoneResult(zoneId, targetLat, targetLon) {
    let nearestDist = Infinity;
    let nearestCity = null;
    for (const city of citiesData) {
        if (city.zone == zoneId) {
            const d = getDist(targetLat, targetLon, city.lat, city.lng);
            if (d < nearestDist) { nearestDist = d; nearestCity = city; }
        }
    }
    return { dist: (nearestDist === Infinity ? 20037 : nearestDist), city: nearestCity };
}

/**
 * SUBMIT guess
 */
function submitGuess(zone) {
    if (gameOver || !roundLoaded) return;

    const isCorrect = (zone.id == currentCity.zone);
    const result = isCorrect ? { dist: 0, city: currentCity } : findNearestWithZoneResult(zone.id, currentCity.lat, currentCity.lng);
    const roundDist = Math.round(result.dist);
    const refCity = result.city;

    sessionScore += roundDist;
    updateScoreDisplay();

    const actual = legendData.find(l => l.id == currentCity.zone);
    const actualStr = actual ? actual.description : "Unknown";
    const actualColor = actual ? actual.color : "#333";
    const actualCode = actual ? actual.code : "??";
    const actualContrast = getContrastColor(actualColor);

    sessionHistory.push({
        city: currentCity.city.trim(),
        country: currentCity.country.trim(),
        lat: currentCity.lat,
        lng: currentCity.lng,
        dist: roundDist,
        zoneCode: actualCode,
        zoneColor: actualColor,
        zoneContrast: actualContrast,
        guessedCode: zone.code,
        guessedColor: zone.color,
        guessedContrast: getContrastColor(zone.color),
        refCity: refCity ? `${refCity.city.trim()}, ${refCity.country.trim()}` : "Global Registry",
    });

    const titleEl = document.getElementById('modal-title');
    titleEl.textContent = isCorrect ? "Correct!" : "Wrong Zone...";
    titleEl.style.color = isCorrect ? "#388e3c" : "#d32f2f";

    const unitLabel = currentUnits === 'metric' ? 'KM' : 'MI';
    const distToDisplay = Math.round(currentUnits === 'metric' ? roundDist : roundDist * 0.621371);

    document.getElementById('modal-details').innerHTML = `
        <div style="text-align: left; background: #050505; border: 1px solid #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div style="color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase;">LOCATION</div>
            <div style="font-weight: 700; margin-bottom: 15px; font-size: 1.1rem;">${currentCity.city.trim()}, ${currentCity.country}</div>
            <div style="color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase;">CORRECT CLIMATE</div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="climate-pill" style="background: ${actualColor}; color: ${actualContrast}">${actualCode}</span>
                <span style="font-weight: 700; color: #fff;">${actualStr}</span>
            </div>
        </div>
        <div style="text-align: left; padding: 0 10px; margin-bottom: 20px;">
             <div style="font-weight: 800; color: #ababab; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">GAP: ${distToDisplay} ${unitLabel}</div>
             <div style="font-size: 0.63rem; color: #555; font-weight: 800; display:flex; align-items:center;">
                CLOSEST <span style="display:inline-flex; justify-content:center; align-items:center; min-width:35px; height:16px; background:${zone.color}; color:${getContrastColor(zone.color)}; border-radius:3px; margin:0 6px; font-size:0.55rem; font-weight:900;">${zone.code}</span> MATCH: <span style="color: #666; margin-left: 5px;">${refCity ? refCity.city.trim() + ', ' + refCity.country.trim() : "N/A"}</span>
             </div>
        </div>
    `;

    document.getElementById('feedback-overlay').classList.remove('hidden');
    if (currentRound === maxRounds) {
        document.getElementById('modal-btn').textContent = "View Final Results";
    }
}

function showFinalResults() {
    const title = document.getElementById('modal-title');
    const details = document.getElementById('modal-details');
    const btn = document.getElementById('modal-btn');
    const modal = document.getElementById('modal');

    modal.style.maxWidth = "600px";
    title.innerHTML = `Results`;
    title.style.color = "#fff";

    const displayDist = Math.round(currentUnits === 'metric' ? sessionScore : sessionScore * 0.621371);
    const unitLabel = currentUnits === 'metric' ? 'KM' : 'MI';

    const bestKey = 'best_images_min_dist';
    const currentBest = localStorage.getItem(bestKey);
    if (!currentBest || sessionScore < parseInt(currentBest)) {
        localStorage.setItem(bestKey, sessionScore);
    }

    let historyHtml = sessionHistory.map((h, i) => {
        const d = Math.round(currentUnits === 'metric' ? h.dist : h.dist * 0.621371);
        const visualizerUrl = `https://ioncook.github.io/climate-visualizer/?lat=${h.lat}&lng=${h.lng}&z=10.0&layer=koppen&m=6&era=1991_2020&comp=none&plat=${h.lat}&plng=${h.lng}&p=1`;
        return `
            <div style="display: grid; grid-template-columns: 25px 1fr 1.5fr auto; gap: 10px; align-items: center; padding: 12px 0; border-bottom: 1px solid #111; text-align: left;">
                <span style="font-weight:900; color:#222; font-size: 0.7rem;">0${i + 1}</span>
                <div>
                   <a href="${visualizerUrl}" target="_blank" style="text-decoration:underline; color:inherit; text-underline-offset: 2px;">
                        <div style="font-weight:700; color:#eee; font-size: 0.8rem; margin-bottom:2px;">${h.city}, ${h.country}</div>
                   </a>
                   <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="display:flex; justify-content:center; align-items:center; min-width:32px; height:15px; background:${h.zoneColor}; border-radius:3px; font-size:0.55rem; font-weight:900; color:${h.zoneContrast}">${h.zoneCode}</span>
                        <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${h.lat},${h.lng}" target="_blank" style="color: #333; text-decoration: none; font-size: 0.5rem; font-weight: 800; border: 1px solid #151515; padding: 1px 3px; border-radius: 2px;">STREET VIEW ↗</a>
                   </div>
                </div>
                <div style="color:var(--text-secondary); font-size: 0.65rem;">
                   <div style="display:flex; align-items:center; font-weight:800; font-size: 0.5rem; color: #555; margin-bottom: 2px;">Closest <div style="display:flex; justify-content:center; align-items:center; min-width:30px; height:12px; background:${h.guessedColor}; color:${h.guessedContrast}; border-radius:2px; margin:0 4px; font-size:0.5rem; font-weight:900;">${h.guessedCode}</div></div>
                   ${h.refCity}
                </div>
                <div style="font-weight:900; color:#eee; font-size: 0.85rem;">${d}<span style="color:#333; font-size:0.6rem; margin-left:2px">${unitLabel}</span></div>
            </div>
        `;
    }).join('');

    details.innerHTML = `
        <div style="margin: 20px 0;">${historyHtml}</div>
        <div style="margin: 30px 0; text-align: center;">
            <div style="font-size: 3.5rem; font-weight: 700; color: #fff; margin-bottom: 5px; letter-spacing: -2px;">${displayDist}<span style="font-size: 1.5rem; letter-spacing: 0; color: #444; margin-left: 5px;">${unitLabel}</span></div>
            <div style="color:#555; font-size: 0.75rem; font-weight:800; text-transform:uppercase; letter-spacing: 1px;">TOTAL DISTANCE</div>
        </div>
        <button onclick="location.reload()" class="modal-btn" style="width:100%; font-weight:800; cursor:pointer; background:#fff; border:none; color:#000; padding:15px; border-radius:30px;">New Game</button>
        <a href="../index.html" style="display: block; margin-top: 15px; color: var(--text-secondary); text-decoration: none; font-size: 0.85rem; font-weight: 700; text-align: center;">Back to Home</a>
    `;
    btn.style.display = "none";
}

function buildZoneGrid() {
    const grid = document.getElementById('zone-grid');
    grid.innerHTML = '';

    const columns = [
        { label: 'A',  codes: ['Af', 'Am', 'Aw'] },
        { label: 'BW', codes: ['BWh', 'BWk'] },
        { label: 'BS', codes: ['BSh', 'BSk'] },
        { label: 'Cs', codes: ['Csa', 'Csb', 'Csc'] },
        { label: 'Cw', codes: ['Cwa', 'Cwb', 'Cwc'] },
        { label: 'Cf', codes: ['Cfa', 'Cfb', 'Cfc'] },
        { label: 'Ds', codes: ['Dsa', 'Dsb', 'Dsc'] },
        { label: 'Dw', codes: ['Dwa', 'Dwb', 'Dwc'] },
        { label: 'Df', codes: ['Dfa', 'Dfb', 'Dfc'] },
        { label: 'E',  codes: ['ET', 'EF'] },
    ];

    // Find the tallest column to normalise row count
    const maxRows = Math.max(...columns.map(c => c.codes.length));

    columns.forEach(col => {
        const colDiv = document.createElement('div');
        colDiv.style.cssText = 'display:flex; flex-direction:column; gap:3px;';

        // Column header label
        const label = document.createElement('div');
        label.className = 'zone-col-label';
        label.textContent = col.label;
        colDiv.appendChild(label);

        col.codes.forEach(code => {
            const zone = legendData.find(l => l.code === code);
            if (!zone) return;
            const btn = document.createElement('button');
            btn.className = 'zone-btn';
            btn.style.background = zone.color;
            btn.title = zone.description;
            btn.textContent = code;
            btn.onclick = () => submitGuess(zone);
            colDiv.appendChild(btn);
        });

        // Fill empty rows so columns align at the top
        const empty = maxRows - col.codes.length;
        for (let i = 0; i < empty; i++) {
            const spacer = document.createElement('div');
            spacer.style.flex = '1';
            colDiv.appendChild(spacer);
        }

        grid.appendChild(colDiv);
    });
}

function setupInteraction() {
    buildZoneGrid();
}

start();
