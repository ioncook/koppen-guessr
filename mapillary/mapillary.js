let totalScore = 0;
let citiesData = [];
let legendData = [];
let currentCity = null;
let lastFiltered = [];
let viewer = null;
const MLY_TOKEN = ""; // Hardcode your token here if you want it built-in
let mlyToken = MLY_TOKEN || localStorage.getItem('mly_token') || "";

// DOM Elements
const scoreVal = document.getElementById('streak-value');
const searchInput = document.getElementById('guess-search');
const dropdown = document.getElementById('dropdown-options');
const feedback = document.getElementById('feedback');
const feedbackMsg = document.getElementById('feedback-message');
const feedbackDetails = document.getElementById('feedback-details');
const nextBtn = document.getElementById('next-btn');

nextBtn.textContent = "Next Round";
const mlyOverlay = document.getElementById('mly-overlay');
const tokenInput = document.getElementById('api-token-input');

if (mlyToken) tokenInput.value = mlyToken;

tokenInput.onchange = (e) => {
    mlyToken = e.target.value;
    localStorage.setItem('mly_token', mlyToken);
    if (!viewer && mlyToken) initViewer();
};

/**
 * Initialize game
 */
async function init() {
    try {
        const [citiesResp, legendResp] = await Promise.all([
            fetch('../cities.json'),
            fetch('../legend.json')
        ]);
        
        const rawCities = await citiesResp.json();
        // 100k+ pop for better chances of coverage
        citiesData = rawCities.filter(c => c.zone > 0 && (c.population || 0) >= 100000);
        legendData = await legendResp.json();
        
        initViewer();
        setupSearch();
        loadNewLocation();
    } catch (e) {
        console.error(e);
        alert("Error loading data. Check cities.json exists.");
    }
}

function initViewer() {
    if (!mlyToken) return;
    try {
        viewer = new Mapillary.Viewer({
            accessToken: mlyToken,
            container: 'mly',
            component: { cover: false }
        });
    } catch(e) {
        console.error("Mapillary Viewer init error:", e);
    }
}

/**
 * Picks a random city and finds a Mapillary image near it
 */
async function loadNewLocation() {
    if (!mlyToken) {
        mlyOverlay.classList.remove('hidden');
        mlyOverlay.innerHTML = "<p>Please enter a Mapillary Client Token below to play.</p>";
        return;
    }

    mlyOverlay.classList.remove('hidden');
    mlyOverlay.innerHTML = '<div class="spinner"></div><p>Searching for street level imagery...</p>';
    
    let imageId = null;
    let attempts = 0;

    while (!imageId && attempts < 15) {
        attempts++;
        const city = citiesData[Math.floor(Math.random() * citiesData.length)];
        currentCity = city;

        // Query Mapillary for an image ID near the city (0.05 deg bbox)
        const radius = 0.05;
        const bbox = `${city.lng - radius},${city.lat - radius},${city.lng + radius},${city.lat + radius}`;
        try {
            const mResp = await fetch(`https://graph.mapillary.com/images?fields=id&limit=1&bbox=${bbox}&access_token=${mlyToken}`);
            const mData = await mResp.json();
            if (mData.data && mData.data.length > 0) {
                imageId = mData.data[0].id;
            }
        } catch (e) {
            console.error("Mapillary fetch error", e);
            break;
        }
    }

    if (imageId) {
        if (!viewer) initViewer();
        viewer.moveToKey(imageId).then(() => {
            mlyOverlay.classList.add('hidden');
        }).catch(err => {
            console.warn("moveToKey failed, retrying...", err);
            loadNewLocation();
        });
    } else {
        mlyOverlay.innerHTML = "<p>Search failed. Check your token or try again.</p>";
    }

    // Reset UI
    searchInput.value = "";
    searchInput.disabled = false;
    dropdown.classList.add('hidden');
    feedback.classList.add('hidden');
    nextBtn.classList.add('hidden');
    searchInput.focus();
}

/**
 * Scoring Logic
 */
function calculateScore(guessId, actualId) {
    const guessObj = legendData.find(l => l.id === guessId);
    const actualObj = legendData.find(l => l.id === actualId);
    
    if (guessId === actualId) return 5000;
    
    let score = 0;
    const gCode = guessObj.code; // e.g. "Cfb"
    const aCode = actualObj.code; // e.g. "Cfa"
    
    // Class match (first letter)
    if (gCode[0] === aCode[0]) {
        score += 2000;
        
        // Dry season match (second letter) for C and D only
        if ((aCode[0] === 'C' || aCode[0] === 'D') && gCode[1] === aCode[1]) {
            score += 1500;
        }
    }
    
    return score;
}

function submitGuess(guess) {
    searchInput.value = `${guess.code} - ${guess.description}`;
    searchInput.disabled = true;
    dropdown.classList.add('hidden');
    
    const score = calculateScore(guess.id, currentCity.zone);
    totalScore += score;
    scoreVal.textContent = totalScore;
    
    feedback.classList.remove('hidden');
    nextBtn.classList.remove('hidden');
    
    const actualZone = legendData.find(l => l.id === currentCity.zone);
    const actualStr = actualZone ? `${actualZone.code} (${actualZone.description})` : "Unknown";
    
    if (score === 5000) {
        feedback.className = "correct";
        feedbackMsg.textContent = "Perfect! 5000 Points";
    } else if (score > 0) {
        feedback.className = "correct";
        feedbackMsg.textContent = `Good! ${score} Points`;
    } else {
        feedback.className = "wrong";
        feedbackMsg.textContent = "Wrong! 0 Points";
    }
    
    feedbackDetails.innerHTML = `Location: <strong>${currentCity.city}, ${currentCity.country}</strong><br>
                                 Actual Climate: <strong>${actualStr}</strong>`;
}

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

    nextBtn.addEventListener('click', loadNewLocation);
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

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

init();
