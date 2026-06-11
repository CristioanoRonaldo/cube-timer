// Import modern official Firebase structural dependencies via secure CDN 
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// !!! Paste your production web config variables directly into this dictionary block !!!
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Google Firebase Framework Infrastructure Instantiations
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// System Local Cache Engine Fallback State Defaults
let appState = {
    settings: {
        theme: "theme-dark",
        inspection: "off",
        zoom: "1.0",
        timerUpdate: "realtime",
        puzzle: "3x3"
    },
    sessions: {
        "Default Session": []
    },
    activeSessionName: "Default Session"
};

let currentUser = null;

// Clock Operational Configurations Lifecycle Markers
let timerState = "IDLE"; 
let startTime = 0;
let timerInterval = null;
let inspectionInterval = null;
let inspectionTimeLeft = 15;
let currentScramble = "";

let currentPhaseIndex = 0;
const phases = ["Cross", "F2L", "OLL", "PLL"];
let currentPhaseSplits = [0, 0, 0, 0];
let lastPhaseTimestamp = 0;

const faceColors = { U: '#ffffff', R: '#b91c1c', F: '#15803d', D: '#eab308', L: '#e67e22', B: '#1d4ed8' };

// Relational Multi-Device Sync Operations Layer
function loadStateFromStorage() {
    const savedState = localStorage.getItem("nexus_timer_pro_state");
    if (savedState) {
        try { appState = JSON.parse(savedState); } catch (e) { console.error(e); }
    }
    syncSettingsUI();
    populateSessionDropdown();
    refreshSessionView();
}

async function saveStateToStorage() {
    localStorage.setItem("nexus_timer_pro_state", JSON.stringify(appState));
    
    // If user authentication token matches cloud parameters, sync asynchronously
    if (currentUser) {
        try {
            await setDoc(doc(db, "users", currentUser.uid), {
                savedAppState: appState,
                lastUpdated: Date.now()
            }, { merge: true });
        } catch (error) {
            console.error("Cloud mutation synchronization interface failed: ", error);
        }
    }
}

// 1. Core Cloud Sync Authentication Interface Handles Logic
onAuthStateChanged(auth, async (user) => {
    const loggedOutView = document.getElementById("auth-logged-out");
    const loggedInView = document.getElementById("auth-logged-in");
    
    if (user) {
        currentUser = user;
        loggedOutView.classList.add("hidden");
        loggedInView.classList.remove("hidden");
        
        document.getElementById("user-avatar").src = user.photoURL || "";
        document.getElementById("user-name").innerText = user.displayName || "Active Cuber";
        
        // Database verification pipeline routing map
        const userDocRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(userDocRef);
        
        if (docSnap.exists()) {
            const remoteData = docSnap.data();
            if (remoteData && remoteData.savedAppState) {
                // Cloud metrics pull down takes structural merge sorting precedence
                appState = remoteData.savedAppState;
                localStorage.setItem("nexus_timer_pro_state", JSON.stringify(appState));
            }
        } else {
            // First time connecting parameters profile initialization update fallback pipeline
            await saveStateToStorage();
        }
        
        syncSettingsUI();
        populateSessionDropdown();
        refreshSessionView();
    } else {
        currentUser = null;
        loggedInView.classList.add("hidden");
        loggedOutView.classList.remove("hidden");
    }
});

document.getElementById("login-btn").onclick = async () => {
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (err) {
        console.error("Identity verification rejected by provider: ", err);
    }
};

document.getElementById("logout-btn").onclick = async () => {
    if (confirm("Disconnect system profile cloud links? Your data remains cached locally.")) {
        try {
            await signOut(auth);
            location.reload(); // Refresh memory registers
        } catch (err) {
            console.error("Authentication mutation pipeline execution fault: ", err);
        }
    }
};

// 2. Structural Scramble Engines Matrix Maps
function generateScramble() {
    const type = appState.settings.puzzle;
    let moves = [], modifiers = ["", "'", "2"], length = 20;

    switch(type) {
        case "2x2": moves = ["U", "R", "F"]; length = 11; break;
        case "4x4": 
        case "5x5": moves = ["U", "D", "R", "L", "F", "B", "Uw", "Rw", "Fw"]; length = 40; break;
        case "Pyraminx": moves = ["U", "L", "R", "B"]; length = 12; break;
        case "Skewb": moves = ["U", "R", "L", "B"]; length = 10; break;
        case "Megaminx": moves = ["R++", "R--", "D++", "D--", "U", "U'"]; length = 30; break;
        default: moves = ["U", "D", "R", "L", "F", "B"]; length = 20; break;
    }

    let scramble = [], lastMove = "";
    while (scramble.length < length) {
        let move = moves[Math.floor(Math.random() * moves.length)];
        if (move !== lastMove) {
            let mod = (type === "Megaminx") ? "" : modifiers[Math.floor(Math.random() * modifiers.length)];
            scramble.push(move + mod);
            lastMove = move;
        }
    }
    
    if (type === "Pyraminx") {
        const tips = ["u", "l", "r", "b"];
        tips.forEach(tip => {
            if (Math.random() > 0.5) scramble.push(tip + (Math.random() > 0.5 ? "'" : ""));
        });
    }

    currentScramble = scramble.join(" ");
    document.getElementById("scramble-text").innerText = currentScramble;
    drawPlaceholderNet();
}

function drawPlaceholderNet() {
    const canvas = document.getElementById("cube-preview");
    const ctx = canvas.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const size = 12; const gap = 1; const faceSize = (size * 3) + (gap * 2);
    const offsets = {
        U: { x: faceSize + 10, y: 5 }, L: { x: 5, y: faceSize + 10 },
        F: { x: faceSize + 10, y: faceSize + 10 }, R: { x: (faceSize * 2) + 15, y: faceSize + 10 },
        B: { x: (faceSize * 3) + 20, y: faceSize + 10 }, D: { x: faceSize + 10, y: (faceSize * 2) + 15 }
    };
    Object.keys(offsets).forEach(face => {
        const { x, y } = offsets[face];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                ctx.fillStyle = faceColors[face];
                ctx.fillRect(x + col * (size + gap), y + row * (size + gap), size, size);
            }
        }
    });
}

// 3. Comprehensive Rolling Analytical Formulae
function calculateRollingAverage(solves, windowSize) {
    if (solves.length < windowSize) return "-";
    const sample = solves.slice(-windowSize);
    let times = sample.map(s => s.penalty === "DNF" ? Infinity : (s.penalty === "+2" ? s.rawTime + 2 : s.rawTime));
    const dnfCount = times.filter(t => t === Infinity).length;
    if (dnfCount >= 2) return "DNF";
    times.sort((a, b) => a - b);
    const sum = times.slice(1, -1).reduce((acc, val) => acc + val, 0);
    return (sum / (windowSize - 2)).toFixed(2);
}

function calculateStats() {
    const currentSolves = appState.sessions[appState.activeSessionName] || [];
    if (currentSolves.length === 0) {
        ["stat-single", "stat-best", "stat-ao5", "stat-ao12", "stat-ao50", "stat-ao100"].forEach(id => {
            document.getElementById(id).innerText = "-";
        });
        return;
    }
    const liveTimes = currentSolves.map(s => s.penalty === "DNF" ? Infinity : (s.penalty === "+2" ? s.rawTime + 2 : s.rawTime));
    const validTimes = liveTimes.filter(t => t !== Infinity);
    const lastSolve = liveTimes[liveTimes.length - 1];
    
    document.getElementById("stat-single").innerText = lastSolve === Infinity ? "DNF" : lastSolve.toFixed(2);
    document.getElementById("stat-best").innerText = validTimes.length > 0 ? Math.min(...validTimes).toFixed(2) : "DNF";
    document.getElementById("stat-ao5").innerText = calculateRollingAverage(currentSolves, 5);
    document.getElementById("stat-ao12").innerText = calculateRollingAverage(currentSolves, 12);
    document.getElementById("stat-ao50").innerText = calculateRollingAverage(currentSolves, 50);
    document.getElementById("stat-ao100").innerText = calculateRollingAverage(currentSolves, 100);
}

// 4. WCA Inspection and Operational Loops
function handleTimerTrigger() {
    if (timerState === "IDLE") {
        if (appState.settings.inspection === "on") {
            timerState = "INSPECTION";
            inspectionTimeLeft = 15;
            document.getElementById("timer-display").innerText = inspectionTimeLeft;
            document.getElementById("timer-display").className = "timer-display inspection";
            inspectionInterval = setInterval(() => {
                inspectionTimeLeft--;
                if (inspectionTimeLeft > 0) {
                    document.getElementById("timer-display").innerText = inspectionTimeLeft;
                } else if (inspectionTimeLeft <= 0 && inspectionTimeLeft > -2) {
                    document.getElementById("timer-display").innerText = "+2";
                } else {
                    clearInterval(inspectionInterval);
                    recordSolveDirectly(0, "DNF");
                }
            }, 1000);
        } else {
            setTimerReadyState();
        }
    } else if (timerState === "INSPECTION") {
        clearInterval(inspectionInterval);
        setTimerReadyState();
    } else if (timerState === "PRIMED") {
        startActiveSolveClock();
    } else if (timerState === "RUNNING") {
        processSplitOrFinish();
    }
}

function setTimerReadyState() {
    timerState = "PRIMED";
    document.getElementById("timer-display").className = "timer-display ready";
    document.getElementById("timer-display").innerText = "0.00";
}

function startActiveSolveClock() {
    timerState = "RUNNING";
    document.getElementById("timer-display").className = "timer-display running";
    startTime = performance.now();
    lastPhaseTimestamp = startTime;
    currentPhaseIndex = 0;
    currentPhaseSplits = [0, 0, 0, 0];

    if (appState.settings.timerUpdate === "realtime") {
        timerInterval = setInterval(() => {
            document.getElementById("timer-display").innerText = ((performance.now() - startTime) / 1000).toFixed(2);
        }, 10);
    } else {
        document.getElementById("timer-display").innerText = "SOLVING";
    }
}

function processSplitOrFinish() {
    const now = performance.now();
    currentPhaseSplits[currentPhaseIndex] = (now - lastPhaseTimestamp) / 1000;
    document.getElementById(`split-${phases[currentPhaseIndex].toLowerCase()}`).innerText = currentPhaseSplits[currentPhaseIndex].toFixed(2);
    lastPhaseTimestamp = now;
    currentPhaseIndex++;

    if (currentPhaseIndex < phases.length) {
        document.getElementById("phase-display").innerText = `Phase Split: ${phases[currentPhaseIndex]}`;
    } else {
        clearInterval(timerInterval);
        recordSolveDirectly((now - startTime) / 1000, (appState.settings.inspection === "on" && inspectionTimeLeft <= 0) ? "+2" : "none");
    }
}

function recordSolveDirectly(raw, penalty) {
    clearInterval(timerInterval);
    timerState = "IDLE";
    appState.sessions[appState.activeSessionName].push({
        id: Date.now(), rawTime: raw, penalty: penalty, scramble: currentScramble, splits: [...currentPhaseSplits], timestamp: Date.now()
    });
    saveStateToStorage();
    refreshSessionView();
    generateScramble();
}

// 5. Data Interoperability Translation Hub (csTimer & CubeDesk Compatibility)
function exportData(format) {
    let dataStr = "", filename = "";
    if (format === "native") {
        dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState));
        filename = "nexustimer_backup.json";
    } else if (format === "cstimer") {
        let csTimerObject = { properties: {}, shadow: [] };
        Object.keys(appState.sessions).forEach((sName, index) => {
            csTimerObject[`session${index + 1}`] = appState.sessions[sName].map(s => [
                [(s.penalty === "+2" ? 2000 : (s.penalty === "DNF" ? -1 : 0)), Math.round(s.rawTime * 1000)], s.scramble, "", Math.round(s.timestamp / 1000)
            ]);
        });
        dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(csTimerObject));
        filename = "cstimer_exported_backup.json";
    }
    const a = document.createElement("a"); a.href = dataStr; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}

function handleImportFile(event) {
    const file = event.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = function(e) {
        try {
            const raw = e.target.result;
            if (raw.includes("properties") || raw.includes("session1")) {
                const parsed = JSON.parse(raw);
                Object.keys(parsed).forEach(k => {
                    if (k.startsWith("session") && Array.isArray(parsed[k])) {
                        appState.sessions[`csTimer ${k.replace('session', 'S')}`] = parsed[k].map(cs => ({
                            id: Math.random() * 1000000, rawTime: cs[0][1] / 1000, penalty: cs[0][0] === 2000 ? "+2" : (cs[0][0] === -1 ? "DNF" : "none"), scramble: cs[1] || "", splits: [0,0,0,0], timestamp: (cs[3] * 1000) || Date.now()
                        }));
                    }
                });
            } else if (raw.includes("seconds") || raw.includes("scramble")) {
                const lines = raw.split("\n"), headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ''));
                appState.sessions["Imported CubeDesk"] = lines.slice(1).map(l => {
                    if (!l.trim()) return null; const v = l.split(",").map(x => x.trim().replace(/"/g, ''));
                    return {
                        id: Math.random() * 1000000, rawTime: parseFloat(v[headers.indexOf("seconds")]), penalty: v[headers.indexOf("is_dnf")] === "true" ? "DNF" : (v[headers.indexOf("is_plus_two")] === "true" ? "+2" : "none"), scramble: v[headers.indexOf("scramble")] || "", splits: [0,0,0,0], timestamp: Date.parse(v[headers.indexOf("created_at")]) || Date.now()
                    };
                }).filter(Boolean);
            } else {
                const native = JSON.parse(raw); if (native.sessions) appState.sessions = Object.assign({}, appState.sessions, native.sessions);
            }
            saveStateToStorage(); populateSessionDropdown(); refreshSessionView(); alert("Data ports parsed successfully!");
        } catch (err) { alert("File schema format mismatch."); }
    };
    r.readAsText(file);
}

// 6. Relational UI Rendering Operations Manager
function populateSessionDropdown() {
    const select = document.getElementById("session-select"); if(!select) return;
    select.innerHTML = "";
    Object.keys(appState.sessions).forEach(sName => {
        const opt = document.createElement("option"); opt.value = sName; opt.innerText = `${sName} (${appState.sessions[sName].length})`;
        if (sName === appState.activeSessionName) opt.selected = true;
        select.appendChild(opt);
    });
}

function refreshSessionView() {
    calculateStats(); updateHistoryUI(); updatePenaltyButtonsState();
}

function updateHistoryUI() {
    const list = document.getElementById("history-list"); if(!list) return;
    list.innerHTML = ""; const activeSolves = appState.sessions[appState.activeSessionName] || [];
    activeSolves.slice().reverse().forEach((solve, index) => {
        const displayTime = solve.penalty === "DNF" ? "DNF" : (solve.penalty === "+2" ? (solve.rawTime + 2).toFixed(2) + " (+2)" : solve.rawTime.toFixed(2));
        const row = document.createElement("div"); row.className = "history-item";
        row.innerHTML = `<span>#${activeSolves.length - index}</span><strong>${displayTime}</strong><button class="history-delete-btn" data-id="${solve.id}">&times;</button>`;
        list.appendChild(row);
    });
    
    // Add event listener targeting strategies dynamically to history elements lists
    document.querySelectorAll(".history-delete-btn").forEach(btn => {
        btn.onclick = (e) => deleteSpecificSolve(Number(e.target.getAttribute("data-id")));
    });
}

function updatePenaltyButtonsState() {
    const activeSolves = appState.sessions[appState.activeSessionName] || [];
    document.querySelectorAll(".p-btn").forEach(b => b.classList.remove("active")); if (activeSolves.length === 0) return;
    const lastSolve = activeSolves[activeSolves.length - 1];
    if (lastSolve.penalty === "none") document.getElementById("penalty-none-btn").classList.add("active");
    if (lastSolve.penalty === "+2") document.getElementById("penalty-plus2-btn").classList.add("active");
    if (lastSolve.penalty === "DNF") document.getElementById("penalty-dnf-btn").classList.add("active");
}

function updateLastSolvePenalty(type) {
    const activeSolves = appState.sessions[appState.activeSessionName] || []; if (activeSolves.length === 0) return;
    activeSolves[activeSolves.length - 1].penalty = type; saveStateToStorage(); refreshSessionView();
}

function deleteSpecificSolve(id) {
    appState.sessions[appState.activeSessionName] = appState.sessions[appState.activeSessionName].filter(s => s.id !== id);
    saveStateToStorage(); populateSessionDropdown(); refreshSessionView();
}

function syncSettingsUI() {
    document.body.className = appState.settings.theme;
    document.getElementById("setting-theme").value = appState.settings.theme;
    document.getElementById("setting-inspection").value = appState.settings.inspection;
    document.getElementById("setting-zoom").value = appState.settings.zoom;
    document.getElementById("setting-timer-update").value = appState.settings.timerUpdate;
    document.getElementById("scramble-type-select").value = appState.settings.puzzle;
    document.documentElement.style.setProperty('--zoom-factor', appState.settings.zoom);
}

// UI Triggers Setup Matrix 
const modalElement = document.getElementById("settings-modal");
document.getElementById("settings-btn").onclick = () => modalElement.classList.add("active");
document.getElementById("close-modal-btn").onclick = () => modalElement.classList.remove("active");

document.getElementById("setting-theme").onchange = (e) => { appState.settings.theme = e.target.value; syncSettingsUI(); saveStateToStorage(); };
document.getElementById("setting-inspection").onchange = (e) => { appState.settings.inspection = e.target.value; saveStateToStorage(); };
document.getElementById("setting-zoom").onchange = (e) => { appState.settings.zoom = e.target.value; syncSettingsUI(); saveStateToStorage(); };
document.getElementById("setting-timer-update").onchange = (e) => { appState.settings.timerUpdate = e.target.value; saveStateToStorage(); };
document.getElementById("scramble-type-select").onchange = (e) => { appState.settings.puzzle = e.target.value; saveStateToStorage(); generateScramble(); };

document.getElementById("export-native-btn").onclick = () => exportData("native");
document.getElementById("export-cstimer-btn").onclick = () => exportData("cstimer");
document.getElementById("import-file-input").onchange = (e) => handleImportFile(e);
document.getElementById("session-select").onchange = (e) => { appState.activeSessionName = e.target.value; saveStateToStorage(); refreshSessionView(); };

document.getElementById("new-session-btn").onclick = () => {
    const sName = prompt("Enter Session Label:");
    if (sName && !appState.sessions[sName]) {
        appState.sessions[sName] = []; appState.activeSessionName = sName; saveStateToStorage(); populateSessionDropdown(); refreshSessionView();
    }
};

document.getElementById("rename-session-btn").onclick = () => {
    const current = appState.activeSessionName; const updated = prompt("Modify Session Label:", current);
    if (updated && updated !== current && !appState.sessions[updated]) {
        appState.sessions[updated] = appState.sessions[current]; delete appState.sessions[current]; appState.activeSessionName = updated;
        saveStateToStorage(); populateSessionDropdown(); refreshSessionView();
    }
};

document.getElementById("clear-session-btn").onclick = () => {
    if(confirm("Wipe all metrics inside active session?")) {
        appState.sessions[appState.activeSessionName] = []; saveStateToStorage(); populateSessionDropdown(); refreshSessionView();
    }
};

document.getElementById("penalty-none-btn").onclick = () => updateLastSolvePenalty("none");
document.getElementById("penalty-plus2-btn").onclick = () => updateLastSolvePenalty("+2");
document.getElementById("penalty-dnf-btn").onclick = () => updateLastSolvePenalty("DNF");
document.getElementById("delete-last-btn").onclick = () => {
    const cs = appState.sessions[appState.activeSessionName] || []; if(cs.length > 0) deleteSpecificSolve(cs[cs.length - 1].id);
};

window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        e.preventDefault(); if (document.activeElement.tagName === "SELECT" || document.activeElement.tagName === "INPUT") return;
        handleTimerTrigger();
    }
});

// Run Initial Bootstrap Setup Operations
loadStateFromStorage();
generateScramble();