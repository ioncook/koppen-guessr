let citiesData = [];
let legendData = [];
let targetCity = null;
let guesses = 0;
let gameOver = false;
let currentUnits = localStorage.getItem('guesser_units') || 'metric';

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
        citiesData = rawCities.filter(c => c.zone > 0 && c.temp && c.temp.length >= 12 && c.precip && c.precip.length >= 12);
        legendData = await legendResp.json();
        
        const candidates = rawCities.filter((c, i) => (i < 100 || c.capital === 'primary') && (c.temp && c.temp.length >= 12));
        targetCity = candidates[Math.floor(Math.random() * candidates.length)];
        
        console.log("Target set: " + targetCity.city);
        
        setupSearch();
        setupUnitUI();
        
        document.getElementById('play-again-btn').onclick = () => location.reload();
    } catch (e) {
        console.error(e);
        alert("Error loading data.");
    }
}

/**
 * Unit Conversion Helpers
 */
function convertTemp(c) {
    if (currentUnits === 'metric') return { val: Math.round(c * 10) / 10, unit: "°C" };
    return { val: Math.round((c * 9/5 + 32) * 10) / 10, unit: "°F" };
}

function convertPrecip(mm) {
    if (currentUnits === 'metric') return { val: Math.round(mm), unit: "mm" };
    return { val: Math.round((mm / 25.4) * 100) / 100, unit: "in" };
}

/**
 * Stat Calculation (Averages, Trends)
 */
function calculateStats(city) {
    const temps = city.temp || [];
    const precips = city.precip || [];
    const avgTemp = temps.reduce((a,b) => a+b, 0) / 12;
    const totalPrecip = precips.reduce((a,b) => a+b, 0);
    const zoneObj = legendData.find(l => l.id === city.zone);
    const code = zoneObj ? zoneObj.code : "??";
    const color = zoneObj ? zoneObj.color : "transparent";
    
    return {
        name: city.city,
        code: code,
        zoneColor: color,
        avgTemp: avgTemp,
        totalPrecip: totalPrecip,
        tempsRaw: temps,
        precipsRaw: precips
    };
}

/**
 * Main Logic: Submit Guess
 */
let guessHistory = [];
function submitGuess(guessCity) {
    if (gameOver) return;
    
    guesses++;
    document.getElementById('streak-value').textContent = guesses;
    
    guessHistory.push(guessCity);
    renderRow(guessCity);
    
    if (guessCity.city === targetCity.city) handleWin();
}

function renderRow(guessCity) {
    const g = calculateStats(guessCity);
    const t = calculateStats(targetCity);
    
    const row = document.createElement('div');
    row.className = 'result-row';
    
    // CITY NAME
    row.appendChild(createColumn("CITY", g.name, g.name === t.name ? 'exact' : 'wrong'));
    
    // ZONE
    let matchCount = 0;
    const gCode = g.code;
    const tCode = t.code;
    for (let i = 0; i < Math.min(gCode.length, tCode.length); i++) {
        if (gCode[i] === tCode[i]) matchCount++;
    }
    
    let accuracyClass = 'wrong';
    if (gCode === tCode) accuracyClass = 'exact';
    else if (matchCount === 2) accuracyClass = 'partial2';
    else if (matchCount === 1) accuracyClass = 'partial1';
    
    row.appendChild(createZoneColumn(g.code, accuracyClass, g.zoneColor));
    
    // ANNUAL PRECIP
    row.appendChild(createNumericColumn("ANNUAL", g.totalPrecip, t.totalPrecip, 'precip'));
    
    // AVG TEMP
    row.appendChild(createNumericColumn("AVG TEMP", g.avgTemp, t.avgTemp, 'temp'));
    
    // MINI CHART (Trends)
    row.appendChild(createChartColumn(g, t));
    
    const container = document.getElementById('results-container');
    container.prepend(row);
}

/**
 * UI Helpers: Columns
 */
function createColumn(label, val, className) {
    const div = document.createElement('div');
    div.className = `column ${className}`;
    div.innerHTML = `<span class="val">${val}</span><span class="label">${label}</span>`;
    return div;
}

function createZoneColumn(code, accuracyClass, legendColor) {
    const div = document.createElement('div');
    div.className = `column ${accuracyClass}`;
    div.innerHTML = `
        <span class="val zone-field" style="background:${legendColor}; outline: 1px solid rgba(255,255,255,0.2);">${code}</span>
        <span class="label">ZONE</span>
    `;
    return div;
}

/**
 * Numerical Accuracy Scaling
 * PRECIP: exact < 1mm | yellow < 2cm (20mm) | orange < 8cm (80mm)
 * TEMP: exact < 0.1C | yellow < 0.5C | orange < 2.0C
 */
function createNumericColumn(label, val, targetVal, type) {
    const div = document.createElement('div');
    const displayVal = type === 'temp' ? convertTemp(val) : convertPrecip(val);
    
    let className = 'wrong';
    let arrow = "";
    
    const diff = Math.abs(val - targetVal);
    
    if (val === targetVal || diff < 0.05) {
        className = 'exact'; // Green
    } else {
        if (type === 'temp') {
            if (diff <= 0.5) className = 'partial2'; // Yellow
            else if (diff <= 2.0) className = 'partial1'; // Orange
        } else {
            if (diff <= 20) className = 'partial2'; // Yellow
            else if (diff <= 80) className = 'partial1'; // Orange
        }
        arrow = val < targetVal ? "↑" : "↓";
    }
    
    div.className = `column ${className}`;
    div.innerHTML = `
        <span class="val">${displayVal.val}${displayVal.unit}</span>
        <span class="arrow">${arrow}</span>
        <span class="label">${label}</span>
    `;
    return div;
}

/**
 * 2-Row Trend Chart (12 Months, now with Green/Yellow logic)
 */
function createChartColumn(g, t) {
    const col = document.createElement('div');
    col.className = 'column chart-col';
    
    // TEMP Trend 
    const tRow = document.createElement('div');
    tRow.className = 'spark-row';
    tRow.setAttribute('data-type', 'T');
    
    const maxT = Math.max(...g.tempsRaw, ...t.tempsRaw);
    const minT = Math.min(...g.tempsRaw, ...t.tempsRaw);
    const rangeT = maxT - minT || 1;
    
    g.tempsRaw.forEach((val, i) => {
        const bar = document.createElement('div');
        bar.className = 'bar';
        const heightPercent = ((val - minT) / rangeT) * 100;
        bar.style.height = `${Math.max(12, heightPercent)}%`;
        bar.style.alignSelf = 'end';
        
        const diff = Math.abs(val - t.tempsRaw[i]);
        if (diff < 0.2) bar.classList.add('exact'); 
        else if (diff < 1.0) bar.classList.add('close'); 
        else bar.classList.add('wrong'); 

        if (diff > 0.1) {
            const arrow = document.createElement('div');
            arrow.className = 'bar-arrow';
            arrow.textContent = val < t.tempsRaw[i] ? "↑" : "↓";
            bar.appendChild(arrow);
        }
        tRow.appendChild(bar);
    });
    
    // PRECIP Trend 
    const pRow = document.createElement('div');
    pRow.className = 'spark-row';
    pRow.setAttribute('data-type', 'P');
    
    const maxP = Math.max(...g.precipsRaw, ...t.precipsRaw, 1);
    
    g.precipsRaw.forEach((val, i) => {
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = `${Math.max(8, (val / maxP) * 100)}%`;
        bar.style.alignSelf = 'end';
        
        const diff = Math.abs(val - t.precipsRaw[i]);
        if (diff < 0.05 * t.precipsRaw[i] || diff < 3) bar.classList.add('exact');
        else if (diff < 0.15 * t.precipsRaw[i] || diff < 10) bar.classList.add('close');
        else bar.classList.add('wrong');

        if (diff > 1) {
            const arrow = document.createElement('div');
            arrow.className = 'bar-arrow';
            arrow.textContent = val < t.precipsRaw[i] ? "↑" : "↓";
            bar.appendChild(arrow);
        }
        pRow.appendChild(bar);
    });
    
    col.appendChild(tRow);
    col.appendChild(pRow);
    col.innerHTML += `<span class="label">Trends</span>`;
    return col;
}

/**
 * Unit Toggle Logic - with persistence
 */
function setupUnitUI() {
    const toggle = document.getElementById('unit-toggle');
    const m = document.getElementById('unit-metric');
    const imp = document.getElementById('unit-imperial');
    
    m.classList.toggle('active-unit', currentUnits === 'metric');
    imp.classList.toggle('active-unit', currentUnits === 'imperial');

    toggle.onclick = () => {
        currentUnits = currentUnits === 'metric' ? 'imperial' : 'metric';
        localStorage.setItem('guesser_units', currentUnits);
        m.classList.toggle('active-unit', currentUnits === 'metric');
        imp.classList.toggle('active-unit', currentUnits === 'imperial');
        
        document.getElementById('results-container').innerHTML = "";
        guessHistory.forEach(city => renderRow(city));
    };
}

/**
 * Game Win Tracking - Min Guesses Logic
 */
function handleWin() {
    gameOver = true;
    setTimeout(() => {
        document.getElementById('game-over-overlay').classList.remove('hidden');
        document.getElementById('modal-title').textContent = "Victory!";
        document.getElementById('modal-info').textContent = `Correct city: ${targetCity.city}. Result after ${guesses} guesses.`;
        
        document.getElementById('view-guesses-btn').onclick = () => {
            document.getElementById('game-over-overlay').classList.add('hidden');
        };

        const storedBest = localStorage.getItem('best_guesser_min');
        if (!storedBest || guesses < parseInt(storedBest)) {
            localStorage.setItem('best_guesser_min', guesses);
        }
    }, 400);
}

function setupSearch() {
    const input = document.getElementById('guess-search');
    const dropdown = document.getElementById('dropdown-options');
    let lastFiltered = [];

    input.oninput = () => {
        const q = input.value.toLowerCase().trim();
        if (q.length < 2) { dropdown.classList.add('hidden'); return; }
        lastFiltered = citiesData.filter(c => c.city.toLowerCase().startsWith(q) || c.country.toLowerCase().startsWith(q)).slice(0, 15);
        dropdown.innerHTML = "";
        lastFiltered.forEach(c => {
            const d = document.createElement('div');
            d.className = 'option';
            d.textContent = `${c.city}, ${c.country}`;
            d.onclick = () => { input.value = ""; dropdown.classList.add('hidden'); submitGuess(c); };
            dropdown.appendChild(d);
        });
        dropdown.classList.remove('hidden');
    };
    
    input.onkeydown = (e) => {
        if (e.key === 'Enter' && lastFiltered.length > 0) { submitGuess(lastFiltered[0]); input.value = ""; dropdown.classList.add('hidden'); }
    };
}

init();
