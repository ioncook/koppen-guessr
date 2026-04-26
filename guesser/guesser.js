let citiesData = [];
let legendData = [];
let targetCity = null;
let guesses = 0;
let gameOver = false;
let currentUnits = localStorage.getItem('site_units') || 'metric';

/**
 * UTILITY: GET CONTRAST COLOR
 */
function getContrastColor(hex) {
    return '#000';
}

/**
 * Initialization
 */
async function init() {
    try {
        const [citiesResp, legendResp] = await Promise.all([
            fetch('../cities.json'),
            fetch('../legend.json')
        ]);

        const rawCities = await citiesResp.json();
        legendData = await legendResp.json();

        // Data Fallback for Coastal Cities - Filtered to World Capitals
        citiesData = rawCities.filter(c => c.capital === 'primary' && c.zone > 0).map(c => {
            if (isDataZero(c)) {
                const near = findNearestValid(c, rawCities);
                if (near) {
                    c.temp = near.temp;
                    c.precip = near.precip;
                }
            }
            return c;
        });

        // Pick Random target
        const pool = citiesData.filter(c => (c.population || 0) > 600000);
        targetCity = processCityData(pool[Math.floor(Math.random() * pool.length)]);
        console.log("Target:", targetCity.name);

        setupSearch();
        syncUnits();

        // Unit Toggle
        document.getElementById('unit-toggle-small').onclick = () => {
            currentUnits = currentUnits === 'metric' ? 'imperial' : 'metric';
            localStorage.setItem('site_units', currentUnits);
            syncUnits();
            renderGuesses();
        };

        document.getElementById('view-guesses-btn').onclick = () => {
            document.getElementById('game-over-overlay').classList.add('hidden');
        };

        const input = document.getElementById('guess-search');
        input.focus();

        document.addEventListener('keydown', (e) => {
            if (gameOver) return;
            // Focus if typing a single char and not already in an input
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
                input.focus();
            }
        });

        renderGuesses();

    } catch (e) {
        console.error("Guesser Init Error:", e);
    }
}

function isDataZero(c) {
    if (!c.temp || c.temp.length < 1) return true;
    return c.temp.every(t => t === 0);
}

function findNearestValid(city, all) {
    let best = null;
    let minDist = Infinity;
    const pool = all.filter(c => (c.population || 0) > 300000 && !isDataZero(c)).slice(0, 500);
    for (const other of pool) {
        const d = Math.pow(city.lat - other.lat, 2) + Math.pow(city.lng - other.lng, 2);
        if (d < minDist) { minDist = d; best = other; }
    }
    return best;
}

function processCityData(city) {
    const l = legendData.find(item => item.id === city.zone);
    return {
        id: city.zone,
        name: city.city,
        country: city.country,
        code: l ? l.code : "??",
        color: l ? l.color : "#333",
        description: l ? l.description : "Unknown",
        lat: city.lat,
        lng: city.lng,
        temps: city.temp,
        precips: city.precip,
        totalPrecip: city.precip.reduce((a, b) => a + b, 0),
        avgTemp: city.temp.reduce((a, b) => a + b, 0) / 12
    };
}

let sessionGuesses = [];

function syncUnits() {
    document.getElementById('unit-metric').classList.toggle('active', currentUnits === 'metric');
    document.getElementById('unit-imperial').classList.toggle('active', currentUnits === 'imperial');
}

/**
 * SEARCH & SUBMISSION
 */
function setupSearch() {
    const input = document.getElementById('guess-search');
    const drop = document.getElementById('dropdown-options');
    let filtered = [];

    input.oninput = () => {
        const q = input.value.toLowerCase().trim();
        if (q.length < 2) {
            filtered = []; // CLEAR RESULTS
            drop.classList.add('hidden');
            return;
        }

        filtered = citiesData.filter(c =>
            c.city.toLowerCase().includes(q) ||
            c.country.toLowerCase().includes(q)
        ).slice(0, 10);

        drop.innerHTML = "";
        filtered.forEach(c => {
            const div = document.createElement('div');
            div.className = 'option';

            // SINGLE TEXT NODE - ZERO HTML WHITESPACE
            const label = `${c.city.replace(/[\s\u00A0]+/g, ' ').trim()}, ${c.country.replace(/[\s\u00A0]+/g, ' ').trim()}`;
            div.textContent = label;

            div.onclick = () => {
                submitGuess(c);
                input.value = "";
                drop.classList.add('hidden');
            };
            drop.appendChild(div);
        });
        drop.classList.toggle('hidden', filtered.length === 0);
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter' && filtered.length > 0 && !drop.classList.contains('hidden')) {
            submitGuess(filtered[0]);
            input.value = "";
            filtered = []; // CLEAR
            drop.classList.add('hidden');
        }
    };
}

function submitGuess(city) {
    if (gameOver) return;
    const g = processCityData(city);
    sessionGuesses.unshift(g);
    guesses++;
    document.getElementById('streak-value').textContent = guesses;

    renderGuesses();
    if (g.name === targetCity.name) endGame();
}

function renderGuesses() {
    const container = document.getElementById('results-container');
    container.innerHTML = "";

    if (sessionGuesses.length === 0) {
        container.innerHTML = `<div class="empty-message">Guess a city to begin...</div>`;
        return;
    }

    sessionGuesses.forEach(g => {
        const row = document.createElement('div');
        row.className = 'result-row';

        // 1. City Name
        const nameCol = document.createElement('div');
        nameCol.className = 'column' + (g.name === targetCity.name ? ' exact' : '');
        nameCol.innerHTML = `<span class="val">${g.name.trim()}</span><span class="label">${g.country}</span>`;
        row.appendChild(nameCol);

        // 2. Zone
        const zoneCol = document.createElement('div');
        const matchCount = getZoneMatch(g.code, targetCity.code);
        let accuracy = 'wrong';

        if (g.code === targetCity.code) accuracy = 'exact';
        else if (matchCount === 2) accuracy = 'close';
        else if (matchCount === 1) accuracy = 'partial';

        const contrast = getContrastColor(g.color);
        zoneCol.className = `column ${accuracy}`;
        zoneCol.innerHTML = `<span class="climate-pill" style="background:${g.color}; color:${contrast}">${g.code}</span><span class="label">ZONE</span>`;
        row.appendChild(zoneCol);

        // 3. Precip
        row.appendChild(createNumericCol("ANNUAL PRECIP", g.totalPrecip, targetCity.totalPrecip, "precip"));

        // 4. Temp
        row.appendChild(createNumericCol("AVG TEMP", g.avgTemp, targetCity.avgTemp, "temp"));

        // 5. Charts
        row.appendChild(createChartsCol(g, targetCity));

        container.appendChild(row);
    });
}

function getZoneMatch(g, t) {
    let matches = 0;
    const len = Math.min(g.length, t.length);
    for (let i = 0; i < len; i++) {
        if (g[i] === t[i]) matches++;
    }
    return matches;
}

function createNumericCol(label, gVal, tVal, type) {
    const col = document.createElement('div');
    const diff = Math.abs(gVal - tVal);
    let accuracy = "wrong";

    if (type === "precip") {
        if (diff < 50) accuracy = "exact";
        else if (diff < 200) accuracy = "close";
    } else {
        if (diff < 0.5) accuracy = "exact";
        else if (diff < 2) accuracy = "close";
    }

    col.className = `column ${accuracy}`;
    let displayVal = Math.round(gVal);
    let unit = type === "precip" ? "mm" : "°C";

    if (currentUnits === "imperial") {
        if (type === "precip") {
            displayVal = Math.round(gVal * 0.0393701);
            unit = "in";
        } else {
            displayVal = Math.round((gVal * 9 / 5) + 32);
            unit = "°F";
        }
    }

    const arrow = gVal < tVal ? "↑" : (gVal > tVal ? "↓" : "");
    col.innerHTML = `<span class="val">${displayVal}${unit}</span><span style="font-size:0.8rem">${arrow}</span><span class="label">${label}</span>`;
    return col;
}

function createChartsCol(g, t) {
    const col = document.createElement('div');
    col.className = 'column chart-col';

    // Temp Spark
    const tRow = document.createElement('div');
    tRow.className = "spark-row";
    tRow.setAttribute('data-type', 'T');

    const maxT = Math.max(...g.temps, ...t.temps);
    const minT = Math.min(...g.temps, ...t.temps);
    const rangeT = maxT - minT || 1;

    g.temps.forEach((v, i) => {
        const bar = document.createElement('div');
        bar.className = 'bar';
        const h = ((v - minT) / rangeT) * 100;
        bar.style.height = `${Math.max(10, h)}%`;
        bar.style.alignSelf = "end";

        const diff = Math.abs(v - t.temps[i]);
        if (diff < 0.2) bar.classList.add('exact');
        else if (diff < 1.0) bar.classList.add('close');
        else bar.classList.add('wrong');

        if (diff > 0.1) {
            const arrow = document.createElement('div');
            arrow.className = 'bar-arrow';
            arrow.textContent = v < t.temps[i] ? "↑" : "↓";
            bar.appendChild(arrow);
        }



        tRow.appendChild(bar);
    });

    // Precip Spark
    const pRow = document.createElement('div');
    pRow.className = "spark-row";
    pRow.setAttribute('data-type', 'P');

    const maxP = Math.max(...g.precips, ...t.precips);
    const rangeP = maxP || 1;

    g.precips.forEach((v, i) => {
        const bar = document.createElement('div');
        bar.className = 'bar';
        const h = (v / rangeP) * 100;
        bar.style.height = `${Math.max(10, h)}%`;
        bar.style.alignSelf = "end";

        const diff = Math.abs(v - t.precips[i]);
        if (diff < 0.05 * t.precips[i] || diff < 3) bar.classList.add('exact');
        else if (diff < 0.15 * t.precips[i] || diff < 10) bar.classList.add('close');
        else bar.classList.add('wrong');

        if (diff > 1) {
            const arrow = document.createElement('div');
            arrow.className = 'bar-arrow';
            arrow.textContent = v < t.precips[i] ? "↑" : "↓";
            bar.appendChild(arrow);
        }

        const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
        const mLabel = document.createElement('div');
        mLabel.className = 'bar-month';
        mLabel.textContent = months[i];
        bar.appendChild(mLabel);

        pRow.appendChild(bar);
    });

    col.appendChild(tRow);
    col.appendChild(pRow);
    return col;
}

function endGame() {
    gameOver = true;
    const overlay = document.getElementById('game-over-overlay');
    const content = document.getElementById('modal-content');

    const bestKey = 'best_guesser_min';
    const currentBest = localStorage.getItem(bestKey);
    if (!currentBest || guesses < parseInt(currentBest)) {
        localStorage.setItem(bestKey, guesses);
    }

    const contrast = getContrastColor(targetCity.color);

    content.innerHTML = `
        <div style="background:#050505; border:1px solid #1a1a1a; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
            <div style="color:var(--text-secondary); font-size: 0.6rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase;">TARGET CITY</div>
            <div style="font-size: 1.8rem; font-weight: 700; color: #fff;">${targetCity.name}</div>
            <div style="color:var(--text-secondary); margin-bottom: 15px;">${targetCity.country}</div>
            
            <div style="display:flex; justify-content:center; gap:10px; align-items:center;">
                <span class="climate-pill" style="background:${targetCity.color}; color:${contrast}">${targetCity.code}</span>
                <span style="font-weight:700; color:#fff">${targetCity.description}</span>
            </div>
        </div>
        <div style="color:var(--text-secondary); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">SOLVED IN ${guesses} GUESSES</div>
        <a href="https://ioncook.github.io/climate-visualizer/?lat=${targetCity.lat}&lng=${targetCity.lng}&z=10.0&layer=koppen&m=6&era=1991_2020&comp=none&plat=${targetCity.lat}&plng=${targetCity.lng}&p=1" 
           target="_blank" 
           style="display: block; margin-top: 20px; color: var(--text-secondary); text-decoration: none; font-size: 0.8rem; font-weight: 700; opacity: 0.8;">
           View on Climate Visualizer →
        </a>
    `;

    overlay.classList.remove('hidden');
}

init();
