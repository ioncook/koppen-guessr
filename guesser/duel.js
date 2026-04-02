let citiesData = [];
let legendData = [];
let targetCity = null;
let guesses = 0;
let gameOver = false;

// Selection rule: First 100 in array or a primary capital
async function init() {
    try {
        const [citiesResp, legendResp] = await Promise.all([
            fetch('../cities.json'),
            fetch('../legend.json')
        ]);
        
        const rawCities = await citiesResp.json();
        // Robust filter: must have 12 months of temp and precip data
        citiesData = rawCities.filter(c => c.zone > 0 && c.temp && c.temp.length >= 12 && c.precip && c.precip.length >= 12);
        legendData = await legendResp.json();
        
        // Pick target from first 100 or primary capitals
        const candidates = rawCities.filter((c, i) => (i < 100 || c.capital === 'primary') && (c.temp && c.temp.length >= 12));
        targetCity = candidates[Math.floor(Math.random() * candidates.length)];
        
        setupSearch();
        document.getElementById('play-again-btn').onclick = () => location.reload();
    } catch (e) {
        console.error(e);
        alert("Error loading data. Check console.");
    }
}

function calculateStats(city) {
    const temps = city.temp || [];
    const precips = city.precip || [];
    
    // Average Monthly Temperature
    const avgTemp = temps.reduce((a,b) => a+b, 0) / 12;
    // Total Yearly Precipitation
    const totalPrecip = precips.reduce((a,b) => a+b, 0);
    // Peak and Trough
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    
    const zoneObj = legendData.find(l => l.id === city.zone);
    const code = zoneObj ? zoneObj.code : "??";
    let drySeasonCode = code[1] || "f";
    
    return {
        name: city.city,
        code: code,
        avgTemp: Math.round(avgTemp * 10) / 10,
        totalPrecip: Math.round(totalPrecip),
        maxTemp: Math.round(maxTemp * 10) / 10,
        minTemp: Math.round(minTemp * 10) / 10,
        dryType: drySeasonCode
    };
}

function submitGuess(guessCity) {
    if (gameOver) return;
    
    guesses++;
    document.getElementById('streak-value').textContent = guesses;
    
    const g = calculateStats(guessCity);
    const t = calculateStats(targetCity);
    
    const row = document.createElement('div');
    row.className = 'result-row';
    
    // CITY NAME
    row.appendChild(createColumn("CITY", g.name, g.name === t.name ? 'exact' : 'wrong'));
    
    // ZONE
    let zoneClass = 'wrong';
    if (g.code === t.code) zoneClass = 'exact';
    else if (g.code[0] === t.code[0]) zoneClass = 'close';
    row.appendChild(createColumn("ZONE", g.code, zoneClass));
    
    // ANNUAL PRECIP
    row.appendChild(createNumericColumn("ANNUAL PRECIP", g.totalPrecip, t.totalPrecip, "mm"));
    
    // AVG TEMP
    row.appendChild(createNumericColumn("AVG TEMP", g.avgTemp, t.avgTemp, "°C"));
    
    // DRY SEASON
    row.appendChild(createColumn("DRY SEASON", g.dryType, (g.dryType === t.dryType) ? 'exact' : 'wrong'));
    
    // MAX MONTHLY
    row.appendChild(createNumericColumn("MAX MONTHLY", g.maxTemp, t.maxTemp, "°C"));
    
    // MIN MONTHLY
    row.appendChild(createNumericColumn("MIN MONTHLY", g.minTemp, t.minTemp, "°C"));
    
    const container = document.getElementById('results-container');
    container.prepend(row);
    
    if (g.name === t.name) {
        handleWin();
    }
}

function createColumn(label, val, className) {
    const div = document.createElement('div');
    div.className = `column ${className}`;
    div.innerHTML = `<span class="val">${val}</span><span class="label">${label}</span>`;
    return div;
}

function createNumericColumn(label, val, targetVal, unit) {
    const div = document.createElement('div');
    let className = 'wrong';
    let arrow = "";
    
    if (val === targetVal) {
        className = 'exact';
    } else {
        const isTemp = unit === "°C";
        const diff = Math.abs(val - targetVal);
        // Numerical Feedback logic
        if (isTemp) {
            if (diff <= 2.5) className = 'close';
        } else {
            if (diff <= targetVal * 0.2) className = 'close';
        }
        arrow = val < targetVal ? "↑" : "↓";
    }
    
    div.className = `column ${className}`;
    div.innerHTML = `
        <span class="val">${val}${unit}</span>
        <span class="arrow">${arrow}</span>
        <span class="label">${label}</span>
    `;
    return div;
}

function handleWin() {
    gameOver = true;
    setTimeout(() => {
        document.getElementById('game-over-overlay').classList.remove('hidden');
        document.getElementById('modal-title').textContent = "Victory!";
        document.getElementById('modal-info').textContent = `Result: ${targetCity.city}. Solved in ${guesses} guesses.`;
        
        const winCount = parseInt(localStorage.getItem('best_duels') || 0) + 1;
        localStorage.setItem('best_duels', winCount);
    }, 500);
}

function setupSearch() {
    const input = document.getElementById('guess-search');
    const dropdown = document.getElementById('dropdown-options');
    let lastFiltered = [];

    const handleInput = () => {
        const query = input.value.toLowerCase().trim();
        if (query.length < 2) {
            dropdown.classList.add('hidden');
            return;
        }
        
        lastFiltered = citiesData.filter(c => 
            c.city.toLowerCase().startsWith(query) || 
            c.country.toLowerCase().startsWith(query)
        ).slice(0, 15);
        
        renderDropdown(lastFiltered);
    };

    const renderDropdown = (list) => {
        dropdown.innerHTML = "";
        list.forEach(c => {
            const div = document.createElement('div');
            div.className = 'option';
            div.textContent = `${c.city}, ${c.country}`;
            div.onclick = () => {
                input.value = "";
                dropdown.classList.add('hidden');
                submitGuess(c);
            };
            dropdown.appendChild(div);
        });
        dropdown.classList.toggle('hidden', list.length === 0);
    };

    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && lastFiltered.length > 0) {
            submitGuess(lastFiltered[0]);
            input.value = "";
            dropdown.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target)) dropdown.classList.add('hidden');
    });
}

init();
