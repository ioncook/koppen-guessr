let streak = 0;
let citiesData = [];
let legendData = [];
let currentCity = null;
let lastFiltered = [];

function getContrastColor(hex) {
    if (!hex) return "#fff";
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return hsp > 127.5 ? "#000" : "#fff";
}

// DOM Elements
const streakVal = document.getElementById('streak-value');
const cityName = document.getElementById('city-name');
const flagEmoji = document.getElementById('flag-emoji');
const adminCountry = document.getElementById('admin-country');
const searchInput = document.getElementById('guess-search');
const dropdown = document.getElementById('dropdown-options');
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
    
    // Reset UI
    searchInput.value = "";
    searchInput.disabled = false;
    dropdown.classList.add('hidden');
    feedbackOverlay.classList.add('hidden');
    
    searchInput.focus();
}

/**
 * Setup searchable dropdown
 */
function setupSearch() {
    const showAll = () => {
        const query = searchInput.value.toLowerCase().trim();
        if (!query) {
            lastFiltered = [...legendData];
        } else {
            lastFiltered = legendData.filter(item => 
                item.code.toLowerCase().includes(query) || 
                item.description.toLowerCase().includes(query)
            );
        }
        renderDropdown(lastFiltered);
    };

    searchInput.addEventListener('input', showAll);
    searchInput.addEventListener('focus', showAll);

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (lastFiltered.length > 0 && !dropdown.classList.contains('hidden')) {
                e.preventDefault();
                e.stopPropagation();
                submitGuess(lastFiltered[0]);
                searchInput.value = "";
                lastFiltered = [];
                dropdown.classList.add('hidden');
            } else if (!nextBtn.classList.contains('hidden')) {
                e.preventDefault();
                loadNewCity();
            }
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !feedbackOverlay.classList.contains('hidden')) {
            e.preventDefault();
            loadNewCity();
        }
    });

    nextBtn.addEventListener('click', loadNewCity);
}

/**
 * Renders the filtered results in the dropdown
 */
function renderDropdown(filtered) {
    dropdown.innerHTML = "";
    if (filtered.length === 0) {
        dropdown.classList.add('hidden');
        return;
    }

    filtered.forEach(item => {
        const contrast = getContrastColor(item.color);
        const option = document.createElement('div');
        option.className = 'option';
        option.style.display = "flex";
        option.style.alignItems = "center";
        option.style.gap = "15px";
        option.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; min-width:45px; height:20px; background:${item.color}; border-radius:4px; font-size:0.65rem; font-weight:900; color:${contrast}; flex-shrink:0;">${item.code}</div><div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><strong>${item.code}</strong> ${item.description}</div>`;
        option.onclick = () => {
            searchInput.value = "";
            dropdown.classList.add('hidden');
            submitGuess(item);
        };
        dropdown.appendChild(option);
    });

    dropdown.classList.remove('hidden');
}

/**
 * Check if the guess is correct
 */
function submitGuess(guess) {
    searchInput.value = `${guess.code} - ${guess.description}`;
    searchInput.disabled = true;
    dropdown.classList.add('hidden');
    
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
