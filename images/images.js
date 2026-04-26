let citiesData = [];
let legendData = [];
let currentCity = null;
let currentRound = 1;
const maxRounds = 5;
let sessionScore = 0;
let gameOver = false;
let roundId = 0;
let sessionHistory = [];
let filteredPool = []; // For search synchronization

// Global Unit Preference
let currentUnits = localStorage.getItem('site_units') || 'metric';

/**
 * UTILITY: GET CONTRAST COLOR (Black or White)
 */
function getContrastColor(hex) {
    if (!hex) return "#fff";
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return hsp > 127.5 ? "#000" : "#fff";
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

        citiesData = allCities.filter(c => c.zone > 0).map(c => {
            if (isDataDead(c)) {
                const near = findNearestValid(c, allCities);
                if (near) {
                    c.temp = near.temp;
                    c.precip = near.precip;
                }
            }
            return c;
        });

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

function isDataDead(c) {
    if (!c.temp || c.temp.length < 1) return true;
    return c.temp.every(t => t === 0);
}

function findNearestValid(city, all) {
    let best = null;
    let minDist = Infinity;
    const pool = all.filter(c => (c.population || 0) > 300000 && !isDataDead(c)).slice(0, 500);
    for (const other of pool) {
        const d = Math.pow(city.lat - other.lat, 2) + Math.pow(city.lng - other.lng, 2);
        if (d < minDist) { minDist = d; best = other; }
    }
    return best;
}

/**
 * LOAD ROUND IMAGERY
 */
async function loadRound() {
    const loader = document.getElementById('load-curtain');
    const container = document.getElementById('image-container');
    loader.classList.remove('hidden');
    container.style.backgroundImage = 'none';

    let found = false;
    let attempts = 0;
    const pool = citiesData.filter(c => (c.population || 0) > 400000);
    const thisRoundId = ++roundId;

    while (!found && attempts < 50) {
        attempts++;
        if (thisRoundId !== roundId) return;
        const draft = pool[Math.floor(Math.random() * pool.length)];
        try {
            const query = `${draft.city}, ${draft.country}`;
            const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages|original&format=json&pithumbsize=1024&redirects=1&origin=*`;
            const resp = await fetch(url);
            const data = await resp.json();
            const pages = data.query.pages;
            const pId = Object.keys(pages)[0];

            let imgUrl = (pId !== "-1" && pages[pId].original) ? pages[pId].original.source : (pId !== "-1" && pages[pId].thumbnail ? pages[pId].thumbnail.source : null);

            if (!imgUrl) {
                const fUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(draft.city)}&prop=pageimages|original&format=json&pithumbsize=1024&redirects=1&origin=*`;
                const fResp = await fetch(fUrl);
                const fData = await fResp.json();
                const fPid = Object.keys(fData.query.pages)[0];
                if (fPid !== "-1") imgUrl = (fData.query.pages[fPid].original) ? fData.query.pages[fPid].original.source : (fData.query.pages[fPid].thumbnail ? fData.query.pages[fPid].thumbnail.source : null);
            }

            // STRICTOR BLACKLIST
            const badTerms = ['montage', 'mosaic', 'collage', 'gallery', 'collection', 'night', 'at_night', 'blue_hour', 'midnight', 'evening', 'map', 'locator', 'location', 'district', 'region', 'scheme', 'diagram'];
            if (imgUrl && badTerms.some(term => imgUrl.toLowerCase().includes(term))) imgUrl = null;

            if (imgUrl && thisRoundId === roundId) {
                await new Promise((resolve) => {
                    const testImg = new Image();
                    testImg.src = imgUrl;
                    testImg.onload = () => {
                        if (thisRoundId === roundId) {
                            currentCity = draft;
                            currentCity.activeImg = imgUrl;
                            container.style.backgroundImage = `url(${imgUrl})`;
                            loader.classList.add('hidden');
                            document.getElementById('round-indicator').textContent = `ROUND ${currentRound}/${maxRounds}`;
                            document.getElementById('legend-search').focus();
                            found = true;
                        }
                        resolve();
                    };
                    testImg.onerror = () => resolve();
                });
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
    return { dist: (nearestDist === Infinity ? 0 : nearestDist), city: nearestCity };
}

/**
 * SUBMIT guess
 */
function submitGuess(zone) {
    if (gameOver) return;
    filteredPool = []; // CLEAR SEARCH
    const input = document.getElementById('legend-search');
    input.blur();

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
        dist: roundDist,
        zoneCode: actualCode,
        zoneColor: actualColor,
        zoneContrast: actualContrast,
        guessedId: zone.id,
        guessedCode: zone.code,
        guessedColor: zone.color,
        guessedContrast: getContrastColor(zone.color),
        refCity: refCity ? `${refCity.city.trim()}, ${refCity.country.trim()}` : "Global Registry",
        imgUrl: currentCity.activeImg
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

    let historyHtml = sessionHistory.map((h, i) => {
        const d = Math.round(currentUnits === 'metric' ? h.dist : h.dist * 0.621371);
        return `
            <div style="display: grid; grid-template-columns: 25px 1fr 1.5fr auto; gap: 10px; align-items: center; padding: 12px 0; border-bottom: 1px solid #111; text-align: left;">
                <span style="font-weight:900; color:#222; font-size: 0.7rem;">0${i + 1}</span>
                <div>
                   <div style="font-weight:700; color:#eee; font-size: 0.8rem; margin-bottom:2px;">${h.city}</div>
                   <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="display:flex; justify-content:center; align-items:center; min-width:32px; height:15px; background:${h.zoneColor}; border-radius:3px; font-size:0.55rem; font-weight:900; color:${h.zoneContrast}">${h.zoneCode}</span>
                        <a href="${h.imgUrl}" target="_blank" style="color: #333; text-decoration: none; font-size: 0.5rem; font-weight: 800; border: 1px solid #151515; padding: 1px 3px; border-radius: 2px;">IMG ↗</a>
                   </div>
                </div>
                <div style="color:var(--text-secondary); font-size: 0.65rem;">
                   <div style="display:flex; align-items:center; font-weight:800; font-size: 0.5rem; color: #222; margin-bottom: 2px;">Closest <div style="display:flex; justify-content:center; align-items:center; min-width:30px; height:12px; background:${h.guessedColor}; color:${h.guessedContrast}; border-radius:2px; margin:0 4px; font-size:0.5rem; font-weight:900;">${h.guessedCode}</div></div>
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

function setupInteraction() {
    const input = document.getElementById('legend-search');
    const drop = document.getElementById('dropdown');

    input.oninput = () => {
        const q = input.value.toLowerCase().trim();
        if (q.length < 1) { filteredPool = []; drop.classList.add('hidden'); return; }
        filteredPool = legendData.filter(l => l.code.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)).slice(0, 10);
        drop.innerHTML = "";
        filteredPool.forEach(l => {
            const contrast = getContrastColor(l.color);
            const div = document.createElement('div');
            div.className = 'option';
            div.style.display = "flex";
            div.style.alignItems = "center";
            div.style.gap = "15px";
            div.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; min-width:45px; height:20px; background:${l.color}; border-radius:4px; font-size:0.65rem; font-weight:900; color:${contrast}; flex-shrink:0;">${l.code}</div><div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><strong>${l.code}</strong> ${l.description}</div>`;
            div.onclick = () => { input.value = ""; drop.classList.add('hidden'); submitGuess(l); };
            drop.appendChild(div);
        });
        drop.classList.toggle('hidden', filteredPool.length === 0);
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            if (filteredPool.length > 0 && !drop.classList.contains('hidden')) {
                e.preventDefault();
                e.stopPropagation();
                submitGuess(filteredPool[0]);
                input.value = "";
                drop.classList.add('hidden');
            } else {
                const overlay = document.getElementById('feedback-overlay');
                if (overlay.classList.contains('hidden')) {
                    e.preventDefault();
                }
            }
        }
    };
}
start();
