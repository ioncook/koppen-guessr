let streak = 0;
let citiesData = [];
let legendData = [];
let currentCity = null;
let lastFiltered = [];

// DOM Elements
const streakVal = document.getElementById('streak-value');
const cityName = document.getElementById('city-name');
const flagEmoji = document.getElementById('flag-emoji');
const adminCountry = document.getElementById('admin-country');
const searchInput = document.getElementById('guess-search');
const dropdown = document.getElementById('dropdown-options');
const feedback = document.getElementById('feedback');
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
    if (currentCity.admin_name && currentCity.admin_name !== currentCity.city) {
        adminStr = `${currentCity.admin_name}, `;
    }
    adminCountry.textContent = `${adminStr}${currentCity.country}`;
    
    // Reset UI
    searchInput.value = "";
    searchInput.disabled = false;
    dropdown.classList.add('hidden');
    feedback.classList.add('hidden');
    nextBtn.classList.add('hidden');
    
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
        if (e.key === 'Enter' && lastFiltered.length === 1) {
            e.stopPropagation();
            submitGuess(lastFiltered[0]);
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !nextBtn.classList.contains('hidden')) {
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
        const option = document.createElement('div');
        option.className = 'option';
        option.innerHTML = `
            <div class="color-swatch" style="background-color: ${item.color}"></div>
            <div class="option-text">
                <div class="option-code">${item.code}</div>
                <div class="option-desc">${item.description}</div>
            </div>
        `;
        option.onclick = () => submitGuess(item);
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
    
    feedback.classList.remove('hidden');
    nextBtn.classList.remove('hidden');
    
    if (guess.id === currentCity.zone) {
        streak++;
        feedback.className = "correct";
        feedbackMsg.textContent = "Correct!";
        feedbackDetails.textContent = `The climate in ${currentCity.city} is indeed ${guess.code} (${guess.description}).`;
        nextBtn.textContent = "Next Round";
    } else {
        feedback.className = "wrong";
        feedbackMsg.textContent = `Wrong! Streak ended at ${streak}.`;
        streak = 0;
        const correctInfo = correctZone ? `${correctZone.code} (${correctZone.description})` : "Unknown";
        feedbackDetails.textContent = `The correct climate for ${currentCity.city} is ${correctInfo}.`;
        nextBtn.textContent = "Restart Streak";
    }
    
    streakVal.textContent = streak;
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
