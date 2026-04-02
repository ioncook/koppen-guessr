let citiesData = [];
let legendData = [];
let currentCity = null;
let currentRound = 1;
const maxRounds = 5;
let sessionScore = 0; 
let gameOver = false;
let roundId = 0; 
let sessionHistory = []; 

// Global Unit Preference
let currentUnits = localStorage.getItem('site_units') || 'metric';

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
                const near = findNearestAlive(c, allCities);
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

        const handleNext = () => {
            if (gameOver) {
                location.reload();
            } else if (currentRound < maxRounds) {
                currentRound++;
                document.getElementById('feedback-overlay').classList.add('hidden');
                loadRound();
            } else {
                // Game actually ends here
                gameOver = true;
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
                }
            }
        });

        document.getElementById('unit-toggle').onclick = () => {
            currentUnits = currentUnits === 'metric' ? 'imperial' : 'metric';
            localStorage.setItem('site_units', currentUnits);
            syncUnitUI();
            updateScoreDisplay();
        };

    } catch (e) {
        console.error("Critical System Failure:", e);
    }
}

function syncUnitUI() {
    document.getElementById('unit-metric').classList.toggle('active', currentUnits === 'metric');
    document.getElementById('unit-imperial').classList.toggle('active', currentUnits === 'imperial');
}

function updateScoreDisplay() {
    const displayDist = currentUnits === 'metric' ? sessionScore : Math.round(sessionScore * 0.621371);
    const unitLabel = currentUnits === 'metric' ? 'KM' : 'MI';
    document.getElementById('session-score').textContent = `${displayDist} ${unitLabel}`;
}

function isDataDead(c) {
    if (!c.temp || c.temp.length < 1) return true;
    return c.temp.every(t => t === 0);
}

function findNearestAlive(city, all) {
    let best = null;
    let minDist = Infinity;
    const pool = all.filter(c => (c.population || 0) > 300000 && !isDataDead(c)).slice(0, 1000);
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

            // FILTER: Block Mosaics and Night images
            const badTerms = ['montage', 'mosaic', 'collage', 'gallery', 'collection', 'night', 'at_night', 'blue_hour', 'midnight', 'evening'];
            if (imgUrl && badTerms.some(term => imgUrl.toLowerCase().includes(term))) {
                imgUrl = null;
            }

            if (imgUrl && thisRoundId === roundId) {
                await new Promise((resolve) => {
                    const testImg = new Image();
                    testImg.src = imgUrl;
                    testImg.onload = () => {
                        if (thisRoundId === roundId) {
                            currentCity = draft;
                            container.style.backgroundImage = `url(${imgUrl})`;
                            loader.classList.add('hidden');
                            document.getElementById('round-indicator').textContent = `ROUND ${currentRound}/${maxRounds}`;
                            document.getElementById('legend-search').focus(); // AUTOFOCUS FOR RAPID TYPING
                            found = true;
                        }
                        resolve();
                    };
                    testImg.onerror = () => resolve();
                });
            }
        } catch (e) { console.warn("Retrying imagery..."); }
    }
}

/**
 * GEOGRAPHIC SCORING
 */
function getDist(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestWithZoneResult(zoneId, targetLat, targetLon) {
    let nearestDist = Infinity;
    let nearestCity = null;
    for (const city of citiesData) {
        if (city.zone == zoneId) {
            const d = getDist(targetLat, targetLon, city.lat, city.lng);
            if (d < nearestDist) {
                nearestDist = d;
                nearestCity = city;
            }
        }
    }
    return { dist: (nearestDist === Infinity ? 0 : nearestDist), city: nearestCity };
}

/**
 * SUBMIT & SCORING
 */
function submitGuess(zone) {
    if (gameOver) return;
    document.getElementById('legend-search').blur();
    
    const isCorrect = (zone.id == currentCity.zone);
    const result = isCorrect ? { dist: 0, city: currentCity } : findNearestWithZoneResult(zone.id, currentCity.lat, currentCity.lng);
    const roundDist = result.dist;
    const refCity = result.city;
    
    sessionScore += Math.round(roundDist);
    updateScoreDisplay();

    const actual = legendData.find(l => l.id == currentCity.zone);
    const actualStr = actual ? actual.description : "Unclassified";
    const actualColor = actual ? actual.color : "#333";
    const actualCode = actual ? actual.code : "??";

    // Track round history with reference city
    sessionHistory.push({
        city: currentCity.city,
        country: currentCity.country,
        dist: Math.round(roundDist),
        zoneCode: actualCode,
        zoneColor: actualColor,
        refCity: refCity ? `${refCity.city}, ${refCity.country}` : "Global Registry"
    });

    const titleEl = document.getElementById('modal-title');
    titleEl.textContent = isCorrect ? "Perfect Catch!" : "Geographic Deviation";
    titleEl.style.color = isCorrect ? "#388e3c" : "#d32f2f";
    
    const unitLabel = currentUnits === 'metric' ? 'KM' : 'MI';
    const distToDisplay = currentUnits === 'metric' ? Math.round(roundDist) : Math.round(roundDist * 0.621371);

    document.getElementById('modal-details').innerHTML = `
        <div style="text-align: left; background: #050505; border: 1px solid #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div style="color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase;">LOCATION</div>
            <div style="font-weight: 700; margin-bottom: 15px; font-size: 1.1rem;">${currentCity.city.trim()}, ${currentCity.country}</div>
            
            <div style="color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase;">CORRECT CLIMATE</div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="climate-pill" style="background: ${actualColor}">${actualCode}</span>
                <span style="font-weight: 700; color: #fff;">${actualStr}</span>
            </div>
        </div>
        <div style="text-align: left; padding: 0 10px; margin-bottom: 20px;">
             <div style="font-weight: 800; color: var(--accent-color); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">ROUND GAP: ${distToDisplay} ${unitLabel}</div>
             <div style="font-size: 0.65rem; color: #444; font-weight: 800;">CLOSEST MATCH: <span style="color: #666;">${refCity ? refCity.city + ', ' + refCity.country : "N/A"}</span></div>
        </div>
    `;

    document.getElementById('feedback-overlay').classList.remove('hidden');
    if (currentRound === maxRounds) {
        // gameOver = true; // DO NOT SET GAME OVER YET
        document.getElementById('modal-btn').textContent = "View Summary";
        saveBestScore();
    }
}

function saveBestScore() {
    const currentBest = localStorage.getItem('best_images_min_dist');
    if (!currentBest || sessionScore < parseFloat(currentBest)) {
        localStorage.setItem('best_images_min_dist', sessionScore);
    }
}

function showFinalResults() {
    const title = document.getElementById('modal-title');
    const details = document.getElementById('modal-details');
    const btn = document.getElementById('modal-btn');
    const modal = document.getElementById('modal');

    modal.style.borderColor = "#ababab"; 
    modal.style.maxWidth = "580px"; 
    title.innerHTML = `<span style="font-size: 0.8rem; color: #777; letter-spacing: 2px; text-transform: uppercase;">Final Performance</span><br>Session Complete`;
    title.style.color = "#fff";
    
    const displayDist = currentUnits === 'metric' ? sessionScore : Math.round(sessionScore * 0.621371);
    const unitLabel = currentUnits === 'metric' ? 'KM' : 'MI';

    let historyHtml = sessionHistory.map((h, i) => {
        const d = currentUnits === 'metric' ? h.dist : Math.round(h.dist * 0.621371);
        return `
            <div style="display: grid; grid-template-columns: 30px 1.2fr 1fr auto; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid #111; text-align: left;">
                <span style="font-weight:900; color:#333; font-size: 0.7rem;">0${i+1}</span>
                <div>
                   <div style="font-weight:700; color:#eee; font-size: 0.85rem;">${h.city}</div>
                   <div style="color:${h.zoneColor}; font-size: 0.6rem; font-weight:800; text-transform:uppercase;">${h.zoneCode}</div>
                </div>
                <div style="color:var(--text-secondary); font-size: 0.7rem;">
                   <div style="font-weight:800; text-transform:uppercase; font-size: 0.55rem; color: #444; margin-bottom: 2px;">Closest ${h.zoneCode}</div>
                   ${h.refCity}
                </div>
                <div style="font-weight:900; color:#eee; font-size: 0.85rem;">${d}<span style="color:#444; font-size:0.6rem; margin-left:2px">${unitLabel}</span></div>
            </div>
        `;
    }).join('');

    details.innerHTML = `
        <div style="margin: 20px 0;">
            ${historyHtml}
        </div>
        <div style="margin: 30px 0 40px 0; text-align: center;">
            <div style="font-size: 3.5rem; font-weight: 700; color: #fff; margin-bottom: 5px; letter-spacing: -2px;">${displayDist}<span style="font-size: 1.5rem; letter-spacing: 0; color: #555; margin-left: 5px;">${unitLabel}</span></div>
            <div style="color:var(--text-secondary); font-size: 0.75rem; font-weight:800; text-transform:uppercase; letter-spacing: 1px;">TOTAL GEOGRAPHIC DEVIATION</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px; align-items:center;">
             <button onclick="location.reload()" class="modal-btn" style="width:100%; font-weight:800; cursor:pointer; background:#fff; border:none; color:#000; padding:15px; border-radius:30px; font-size: 0.95rem;">Play New Challenge</button>
             <a href="../index.html" style="color:var(--text-secondary); text-decoration:none; font-size: 0.85rem; font-weight:700; margin-top: 10px;">Back to Dashboard</a>
        </div>
    `;
    btn.style.display = "none";
}

function setupInteraction() {
    const input = document.getElementById('legend-search');
    const drop = document.getElementById('dropdown');
    let filtered = [];
    input.oninput = () => {
        const q = input.value.toLowerCase().trim();
        if (q.length < 1) { drop.classList.add('hidden'); return; }
        filtered = legendData.filter(l => l.code.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)).slice(0, 10);
        drop.innerHTML = "";
        filtered.forEach(l => {
            const div = document.createElement('div');
            div.className = 'option';
            div.innerHTML = `<strong>${l.code}</strong> ${l.description}`;
            div.onclick = () => { input.value = ""; drop.classList.add('hidden'); submitGuess(l); };
            drop.appendChild(div);
        });
        drop.classList.remove('hidden');
    };
    input.onkeydown = (e) => {
        if (e.key === 'Enter' && filtered.length > 0) {
            e.stopPropagation();
            submitGuess(filtered[0]);
            input.value = "";
            drop.classList.add('hidden');
        }
    };
}

document.addEventListener('DOMContentLoaded', start);
