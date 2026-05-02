let streak = 0;
let citiesData = [];
let legendData = [];
let currentCity = null;
let lastFiltered = [];

function getContrastColor(hex) {
    return '#000';
}

const streakVal = document.getElementById('streak-value');
const cityName = document.getElementById('city-name');
const flagEmoji = document.getElementById('flag-emoji');
const adminCountry = document.getElementById('admin-country');
const feedbackOverlay = document.getElementById('feedback-overlay');
const feedbackMsg = document.getElementById('feedback-message');
const feedbackDetails = document.getElementById('feedback-details');
const nextBtn = document.getElementById('next-btn');

/**
 * Initialize game: Fetch data and load first city
 */
async function init() {
    try {
        console.log("Initializing...");
        const [citiesResp, legendResp] = await Promise.all([
            fetch('../cities.json'),
            fetch('../legend.json')
        ]);
        
        const rawCities = await citiesResp.json();
        // Filter by zone and population (>= 100k) using original column name 'population'
        citiesData = rawCities.filter(c => c.zone > 0 && (c.population || 0) >= 100000);
        legendData = await legendResp.json();
        
        console.log(`Loaded ${citiesData.length} cities and ${legendData.length} legend entries.`);
        
        loadNewCity();
        setupSearch();
    } catch (e) {
        console.error("Initialization error:", e);
        cityName.textContent = "Error loading data.";
    }
}

/**
 * Picks a random city and updates the UI
 */
function loadNewCity() {
    const randomIndex = Math.floor(Math.random() * citiesData.length);
    currentCity = citiesData[randomIndex];

    cityName.textContent = currentCity.city;
    flagEmoji.textContent = getFlagEmoji(currentCity.iso2);

    let adminStr = "";
    if (currentCity.admin_name && currentCity.admin_name.trim() !== currentCity.city) {
        adminStr = `${currentCity.admin_name.trim()}, `;
    }
    adminCountry.textContent = `${adminStr}${currentCity.country}`;

    feedbackOverlay.classList.add('hidden');
    buildZoneGrid();
}

/**
 * Setup searchable dropdown
 */
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

    const maxRows = Math.max(...columns.map(c => c.codes.length));

    columns.forEach(col => {
        const colDiv = document.createElement('div');
        colDiv.style.cssText = 'display:flex; flex-direction:column; gap:3px;';

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

        const empty = maxRows - col.codes.length;
        for (let i = 0; i < empty; i++) {
            const spacer = document.createElement('div');
            spacer.style.flex = '1';
            colDiv.appendChild(spacer);
        }

        grid.appendChild(colDiv);
    });
}

function setupSearch() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !feedbackOverlay.classList.contains('hidden')) {
            e.preventDefault();
            loadNewCity();
        }
    });
    nextBtn.addEventListener('click', loadNewCity);
}

/**
 * Check if the guess is correct
 */
function submitGuess(guess) {
    const correctZone = legendData.find(l => l.id === currentCity.zone);
    
    if (guess.id === currentCity.zone) {
        streak++;
        feedbackMsg.textContent = "Correct!";
        feedbackMsg.style.color = "#388e3c";
        const contrast = getContrastColor(guess.color);
        feedbackDetails.innerHTML = `
            <div style="text-align: left; background: #050505; border: 1px solid #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <div style="color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase;">LOCATION</div>
                <div style="font-weight: 700; margin-bottom: 15px; font-size: 1.1rem;">${currentCity.city.trim()}, ${currentCity.country}</div>
                <div style="color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase;">CONFIRMED CLIMATE</div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="display:flex; justify-content:center; align-items:center; min-width:45px; height:20px; background:${guess.color}; border-radius:4px; font-size:0.65rem; font-weight:900; color:${contrast};">${guess.code}</span>
                    <span style="font-weight: 700; color: #fff;">${guess.description}</span>
                </div>
            </div>
        `;
        nextBtn.textContent = "Next Round";
    } else {
        feedbackMsg.textContent = `Streak ended at ${streak}`;
        feedbackMsg.style.color = "#d32f2f";
        
        // Save best score
        const best = parseInt(localStorage.getItem('best_streaks') || 0);
        if (streak > best) localStorage.setItem('best_streaks', streak);
        
        streak = 0;
        
        const actualColor = correctZone ? correctZone.color : "#333";
        const actualCode = correctZone ? correctZone.code : "??";
        const actualDesc = correctZone ? correctZone.description : "Unknown";
        const actualContrast = getContrastColor(actualColor);

        feedbackDetails.innerHTML = `
            <div style="text-align: left; background: #050505; border: 1px solid #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <div style="color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase;">LOCATION</div>
                <div style="font-weight: 700; margin-bottom: 15px; font-size: 1.1rem;">${currentCity.city.trim()}, ${currentCity.country}</div>
                <div style="color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase;">CORRECT CLIMATE</div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="display:flex; justify-content:center; align-items:center; min-width:45px; height:20px; background:${actualColor}; border-radius:4px; font-size:0.65rem; font-weight:900; color:${actualContrast};">${actualCode}</span>
                    <span style="font-weight: 700; color: #fff;">${actualDesc}</span>
                </div>
            </div>
        `;
        nextBtn.textContent = "Restart Streak";
    }
    
    streakVal.textContent = streak;
    feedbackOverlay.classList.remove('hidden');
}

/**
 * Helper to convert ISO2 to Flag Emoji
 */
function getFlagEmoji(countryCode) {
    if (!countryCode) return "";
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char =>  127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

init();
