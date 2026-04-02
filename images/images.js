let totalScore = 0;
let currentRound = 1;
const maxRounds = 5;
let sessionScores = [];

let citiesData = [];
let legendData = [];
let currentCity = null;
let lastFiltered = [];

const MLY_TOKEN = "MLY|26486941317612277|f3890ff71c6a2323e2b8f7233812bbcb";
let mlyToken = MLY_TOKEN;

// DOM Elements
const scoreVal = document.getElementById('streak-total');
const roundIndicator = document.getElementById('round-indicator');
const searchInput = document.getElementById('guess-search');
const dropdown = document.getElementById('dropdown-options');
const nextBtn = document.getElementById('next-btn');

const modalOverlay = document.getElementById('modal-overlay');
const modalMsg = document.getElementById('feedback-modal-message');
const modalDetails = document.getElementById('feedback-modal-details');

const mlyContainer = document.getElementById('mly-container');
const mlyOverlay = document.getElementById('mly-overlay');

nextBtn.textContent = "Next Round";

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
        citiesData = rawCities.filter(c => c.zone > 0 && (c.population || 0) >= 100000);
        legendData = await legendResp.json();
        
        setupSearch();
        loadNewLocation();
        setupInteraction();
    } catch (e) {
        console.error(e);
        alert("Error loading data.");
    }
}

/**
 * Load Location Logic
 */
async function loadNewLocation() {
    if (currentRound > maxRounds) {
        showSummary();
        return;
    }

    modalOverlay.classList.remove('active');
    roundIndicator.textContent = `ROUND ${currentRound}/${maxRounds}`;
    mlyOverlay.classList.remove('hidden');
    mlyOverlay.innerHTML = '<div class="spinner"></div><p>Finding climate imagery...</p>';
    
    let imageUrl = null;
    let attempts = 0;

    while (!imageUrl && attempts < 25) {
        attempts++;
        const city = citiesData[Math.floor(Math.random() * citiesData.length)];
        currentCity = city;

        const radius = 0.05;
        const bbox = `${city.lng - radius},${city.lat - radius},${city.lng + radius},${city.lat + radius}`;
        try {
            const mResp = await fetch(`https://graph.mapillary.com/images?fields=id&limit=1&bbox=${bbox}&access_token=${mlyToken}`);
            const mData = await mResp.json();
            if (mData.data && mData.data.length > 0) {
                const imgId = mData.data[0].id;
                const imgResp = await fetch(`https://graph.mapillary.com/${imgId}?fields=thumb_2048_url&access_token=${mlyToken}`);
                const imgData = await imgResp.json();
                imageUrl = imgData.thumb_2048_url;
            }
        } catch (e) {
            console.error("Mapillary error", e);
            break;
        }
    }

    if (imageUrl) {
        mlyContainer.style.backgroundImage = `url(${imageUrl})`;
        mlyContainer.style.backgroundSize = "contain";
        mlyContainer.style.backgroundPosition = "center";
        mlyContainer.style.backgroundRepeat = "no-repeat";
        
        resetTransform();
        mlyOverlay.classList.add('hidden');
    } else {
        mlyOverlay.innerHTML = "<p>Search failed. Check token or try again.</p>";
    }

    searchInput.value = "";
    searchInput.disabled = false;
    dropdown.classList.add('hidden');
    searchInput.focus();
}

/**
 * Game Over Summary Screen
 */
function showSummary() {
    const totalPoints = sessionScores.reduce((a, b) => a + b, 0);
    const best = parseInt(localStorage.getItem('best_images') || 0);
    if (totalPoints > best) localStorage.setItem('best_images', totalPoints);

    modalOverlay.classList.add('active');
    modalMsg.textContent = "Images Complete";
    modalDetails.innerHTML = `
        <div style="font-size: 3rem; font-weight: 800; margin: 20px 0;">${totalPoints} PTS</div>
        <p style="color: #555;">Personal Best: ${Math.max(best, totalPoints)}</p>
    `;
    nextBtn.textContent = "Play Again";
    nextBtn.onclick = () => location.reload();
}

/**
 * Interaction Logic (Pan/Zoom)
 */
let scale = 100;
let posX = 50;
let posY = 50;

function setupInteraction() {
    let isDragging = false;
    let lastX, lastY;

    mlyContainer.onmousedown = (e) => {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        mlyContainer.style.cursor = 'grabbing';
        e.preventDefault();
    };

    window.onmousemove = (e) => {
        if (!isDragging || scale <= 100) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        posX -= (dx / mlyContainer.offsetWidth) * 100;
        posY -= (dy / mlyContainer.offsetHeight) * 100;
        posX = Math.max(0, Math.min(100, posX));
        posY = Math.max(0, Math.min(100, posY));
        lastX = e.clientX;
        lastY = e.clientY;
        updateView();
    };

    window.onmouseup = () => {
        isDragging = false;
        mlyContainer.style.cursor = 'grab';
    };

    mlyContainer.onwheel = (e) => {
        e.preventDefault();
        const factor = 15;
        if (e.deltaY < 0) scale += factor;
        else scale = Math.max(100, scale - factor);
        if (scale === 100) { posX = 50; posY = 50; }
        updateView();
    }, { passive: false };
}

function updateView() {
    mlyContainer.style.backgroundSize = `${scale}%`;
    mlyContainer.style.backgroundPosition = `${posX}% ${posY}%`;
}

function resetTransform() {
    scale = 100;
    posX = 50;
    posY = 50;
    updateView();
}

/**
 * Search & Submit logic
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
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (modalOverlay.classList.contains('active')) {
                if (currentRound > maxRounds) location.reload();
                else { currentRound++; loadNewLocation(); }
            } else if (lastFiltered.length === 1 && !searchInput.disabled) {
                submitGuess(lastFiltered[0]);
            }
        }
    });

    nextBtn.onclick = () => {
        if (currentRound > maxRounds) location.reload();
        else {
            currentRound++;
            loadNewLocation();
        }
    };

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
        option.innerHTML = `<div class="color-swatch" style="background-color: ${item.color}"></div>
            <div class="option-text"><div class="option-code">${item.code}</div><div class="option-desc">${item.description}</div></div>`;
        option.onclick = () => submitGuess(item);
        dropdown.appendChild(option);
    });
    dropdown.classList.remove('hidden');
}

function calculateScore(guessId, actualId) {
    const guessObj = legendData.find(l => l.id === guessId);
    const actualObj = legendData.find(l => l.id === actualId);
    if (!guessObj || !actualObj) return 0;
    if (guessId === actualId) return 5000;
    let score = 0;
    const gCode = guessObj.code;
    const aCode = actualObj.code;
    if (gCode[0] === aCode[0]) {
        score += 2000;
        if ((aCode[0] === 'C' || aCode[0] === 'D') && gCode[1] === aCode[1]) score += 1500;
    }
    return score;
}

function submitGuess(guess) {
    searchInput.value = `${guess.code} - ${guess.description}`;
    searchInput.disabled = true;
    dropdown.classList.add('hidden');
    
    const score = calculateScore(guess.id, currentCity.zone);
    sessionScores.push(score);
    totalScore += score;
    scoreVal.textContent = totalScore;

    // Show Modal
    modalOverlay.classList.add('active');
    
    const actualZone = legendData.find(l => l.id === currentCity.zone);
    const actualStr = actualZone ? `${actualZone.code} (${actualZone.description})` : "Unknown";
    
    if (score === 5000) {
        modalMsg.textContent = "Perfect! 5000 pts";
        modalMsg.style.color = "var(--success-color)";
    } else if (score > 0) {
        modalMsg.textContent = `Good! ${score} pts`;
        modalMsg.style.color = "var(--accent-color)";
    } else {
        modalMsg.textContent = "Wrong! 0 pts";
        modalMsg.style.color = "var(--error-color)";
    }
    
    modalDetails.innerHTML = `
        <div style="margin: 15px 0;">
            Location: <span style="color:white; font-weight:bold;">${currentCity.city}, ${currentCity.country}</span><br>
            Climate: <span style="color:white; font-weight:bold;">${actualStr}</span>
        </div>
        <p style="font-size: 0.8rem; margin-top: 20px;">Press Enter for Next Round</p>
    `;
    
    if (currentRound === maxRounds) {
        nextBtn.textContent = "See Final Summary";
    } else {
        nextBtn.textContent = "Next Round";
    }
}

init();
