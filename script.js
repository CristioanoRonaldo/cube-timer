// Relational Global App Configurations State Object
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

// Lifecycle State Indicators
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
let cubeState = {};

// Local Storage Core Sync Handlers
function loadStateFromStorage() {
    const savedState = localStorage.getItem("nexus_timer_pro_state");
    if (savedState) {
        try {
            appState = JSON.parse(savedState);
        } catch (e) {
            console.error("Error standardizing application storage tree parsing", e);
        }
    }
    syncSettingsUI();
    populateSessionDropdown();
    refreshSessionView();
}

function saveStateToStorage() {
    localStorage.setItem("nexus_timer_pro_state", JSON.stringify(appState));
}

// 1. Structural Scramble Engines Matrix Maps
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
    
    // Pyraminx custom extra structural logic tracking for tips
    if (type === "Pyraminx") {
        const tips = ["u", "l", "r", "b"];
        tips.forEach(tip => {
            if (Math.random() > 0.5) {
                scramble.push(tip + (Math.random() > 0.5 ? "'" : ""));
            }
        });
    }

    currentScramble = scramble.join(" ");
    document.getElementById("scramble-text").innerText = currentScramble;
    drawPlaceholderNet();
}

function drawPlaceholderNet() {
    const canvas = document.getElementById("cube-preview");
    const ctx = canvas.getContext("2d");
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

// 2. Comprehensive Metric Analytics Layer
function calculateRollingAverage(solves, windowSize) {
    if (solves.length < windowSize) return "-";
    const sample = solves.slice(-windowSize);
    
    let times = sample.map(s => {
        if (s.penalty === "DNF") return Infinity;
        return s.penalty === "+2" ? s.rawTime + 2 : s.rawTime;
    });

    // WCA Rule: If there are 2 or more DNFs within the sample window, the entire average becomes a DNF
    const dnfCount = times.filter(t => t === Infinity).length;
    if (dnfCount >= 2) return "DNF";

    times.sort((a, b) => a - b);
    
    // Discard the absolute fastest and slowest times from the sample window
    const activeTimes = times.slice(1, -1);
    const sum = activeTimes.reduce((acc, val) => acc + val, 0);
    return (sum / activeTimes.length).toFixed(2);
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

    // Current & Best Single Calculations
    const lastSolve = liveTimes[liveTimes.length - 1];
    document.getElementById("stat-single").innerText = lastSolve === Infinity ? "DNF" : lastSolve.toFixed(2);
    document.getElementById("stat-best").innerText = validTimes.length > 0 ? Math.min(...validTimes).toFixed(2) : "DNF";

    // Standard WCA Rolling Window Ranges Updates
    document.getElementById("stat-ao5").innerText = calculateRollingAverage(currentSolves, 5);
    document.getElementById("stat-ao12").innerText = calculateRollingAverage(currentSolves, 12);
    document.getElementById("stat-ao50").innerText = calculateRollingAverage(currentSolves, 50);
    document.getElementById("stat-ao100").innerText = calculateRollingAverage(currentSolves, 100);
}

// 3. WCA Inspection and Core Stopwatch Loop Engine
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
            const elapsed = (performance.now() - startTime) / 1000;
            document.getElementById("timer-display").innerText = elapsed.toFixed(2);
        }, 10);
    } else {
        document.getElementById("timer-display").innerText = "SOLVING";
    }
}

function processSplitOrFinish() {
    const now = performance.now();
    const splitDuration = (now - lastPhaseTimestamp) / 1000;
    currentPhaseSplits[currentPhaseIndex] = splitDuration;
    
    document.getElementById(`split-${phases[currentPhaseIndex].toLowerCase()}`).innerText = splitDuration.toFixed(2);
    lastPhaseTimestamp = now;
    currentPhaseIndex++;

    if (currentPhaseIndex < phases.length) {
        document.getElementById("phase-display").innerText = `Phase Split: ${phases[currentPhaseIndex]}`;
    } else {
        clearInterval(timerInterval);
        const finalRaw = (now - startTime) / 1000;
        
        // Handle post-inspection penalties
        let assignedPenalty = "none";
        if (appState.settings.inspection === "on" && inspectionTimeLeft <= 0) {
            assignedPenalty = "+2";
        }

        recordSolveDirectly(finalRaw, assignedPenalty);
    }
}

function recordSolveDirectly(raw, penalty) {
    clearInterval(timerInterval);
    timerState = "IDLE";
    
    const solveInstance = {
        id: Date.now(),
        rawTime: raw,
        penalty: penalty,
        scramble: currentScramble,
        splits: [...currentPhaseSplits],
        timestamp: Date.now()
    };

    appState.sessions[appState.activeSessionName].push(solveInstance);
    saveStateToStorage();
    refreshSessionView();
    generateScramble();
}

// 4. Multi-Format Interoperable Data Parsing Hub
function exportData(format) {
    let dataStr = "";
    let filename = "";

    if (format === "native") {
        dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState));
        filename = "nexustimer_backup.json";
    } else if (format === "cstimer") {
        // Translation layer to compile database objects matching csTimer's native schema structural arrays
        let csTimerObject = { properties: {}, shadow: [] };
        Object.keys(appState.sessions).forEach((sName, index) => {
            csTimerObject[`session${index + 1}`] = appState.sessions[sName].map(s => {
                let pCode = 0;
                if (s.penalty === "+2") pCode = 2000;
                if (s.penalty === "DNF") pCode = -1;
                return [[pCode, Math.round(s.rawTime * 1000)], s.scramble, "", s.timestamp / 1000];
            });
        });
        dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(csTimerObject));
        filename = "cstimer_exported_backup.json";
    }

    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = function(e) {
        try {
            const rawContent = e.target.result;
            
            // Check for csTimer structural indicators
            if (rawContent.includes("properties") || rawContent.includes("session1")) {
                const parsedCs = JSON.parse(rawContent);
                Object.keys(parsedCs).forEach(key => {
                    if (key.startsWith("session") && Array.isArray(parsedCs[key])) {
                        const targetSessionName = `Imported csTimer ${key}`;
                        appState.sessions[targetSessionName] = parsedCs[key].map(csSolve => {
                            const penaltyVal = csSolve[0][0];
                            let penaltyStr = "none";
                            if (penaltyVal === 2000) penaltyStr = "+2";
                            if (penaltyVal === -1) penaltyStr = "DNF";

                            return {
                                id: Math.random() * 100000,
                                rawTime: csSolve[0][1] / 1000,
                                penalty: penaltyStr,
                                scramble: csSolve[1] || "",
                                splits: [0,0,0,0],
                                timestamp: (csSolve[3] * 1000) || Date.now()
                            };
                        });
                    }
                });
                alert("csTimer parameters parsed and integrated successfully!");
            } 
            // Universal standard text parser matching fallback options
            else {
                const nativeParsed = JSON.parse(rawContent);
                if (nativeParsed.sessions) {
                    appState.sessions = Object.assign({}, appState.sessions, nativeParsed.sessions);
                    alert("Native structural backup unified smoothly.");
                }
            }
            
            saveStateToStorage();
            populateSessionDropdown();
            refreshSessionView();
        } catch (err) {
            alert("File format mismatch. Verify the schema mapping options and try again.");
            console.error(err);
        }
    };
    fileReader.readAsText(file);
}

// 5. Relational Session Actions Manager UI
function populateSessionDropdown() {
    const select = document.getElementById("session-select");
    select.innerHTML = "";
    Object.keys(appState.sessions).forEach(sName => {
        const option = document.createElement("option");
        option.value = sName;
        option.innerText = `${sName} (${appState.sessions[sName].length})`;
        if (sName === appState.activeSessionName) option.selected = true;
        select.appendChild(option);
    });
}

function refreshSessionView() {
    calculateStats();
    updateHistoryUI();
    updatePenaltyButtonsState();
}

function updateHistoryUI() {
    const list = document.getElementById("history-list");
    list.innerHTML = "";
    const activeSolves = appState.sessions[appState.activeSessionName] || [];

    activeSolves.slice().reverse().forEach((solve, index) => {
        const adjustedIdx = activeSolves.length - index;
        const displayTime = solve.penalty === "DNF" ? "DNF" : (solve.penalty === "+2" ? (solve.rawTime + 2).toFixed(2) + " (+2)" : solve.rawTime.toFixed(2));
        
        const row = document.createElement("div");
        row.className = "history-item";
        row.innerHTML = `
            <span>#${adjustedIdx}</span>
            <strong>${displayTime}</strong>
            <button class="history-delete-btn" onclick="deleteSpecificSolve(${solve.id})">&times;</button>
        `;
        list.appendChild(row);
    });
}

function updatePenaltyButtonsState() {
    const activeSolves = appState.sessions[appState.activeSessionName] || [];
    // Reset selection indicators
    document.querySelectorAll(".p-btn").forEach(b => b.classList.remove("active"));
    
    if (activeSolves.length === 0) return;
    const lastSolve = activeSolves[activeSolves.length - 1];
    
    if (lastSolve.penalty === "none") document.getElementById("penalty-none-btn").classList.add("active");
    if (lastSolve.penalty === "+2") document.getElementById("penalty-plus2-btn").classList.add("active");
    if (lastSolve.penalty === "DNF") document.getElementById("penalty-dnf-btn").classList.add("active");
}

function updateLastSolvePenalty(type) {
    const activeSolves = appState.sessions[appState.activeSessionName] || [];
    if (activeSolves.length === 0) return;
    activeSolves[activeSolves.length - 1].penalty = type;
    saveStateToStorage();
    refreshSessionView();
}

function deleteSpecificSolve(id) {
    appState.sessions[appState.activeSessionName] = appState.sessions[appState.activeSessionName].filter(s => s.id !== id);
    saveStateToStorage();
    populateSessionDropdown();
    refreshSessionView();
}

// 6. Complete Wiring Infrastructure Wiring Initializers
function syncSettingsUI() {
    document.body.className = appState.settings.theme;
    document.getElementById("setting-theme").value = appState.settings.theme;
    document.getElementById("setting-inspection").value = appState.settings.inspection;
    document.getElementById("setting-zoom").value = appState.settings.zoom;
    document.getElementById("setting-timer-update").value = appState.settings.timerUpdate;
    document.getElementById("scramble-type-select").value = appState.settings.puzzle;
    document.documentElement.style.setProperty('--zoom-factor', appState.settings.zoom);
}

const modalElement = document.getElementById("settings-modal");
document.getElementById("settings-btn").onclick = () => modalElement.classList.add("active");
document.getElementById("close-modal-btn").onclick = () => modalElement.classList.remove("active");

// Global interactive configuration binding mappings
document.getElementById("setting-theme").onchange = (e) => { appState.settings.theme = e.target.value; syncSettingsUI(); saveStateToStorage(); };
document.getElementById("setting-inspection").onchange = (e) => { appState.settings.inspection = e.target.value; saveStateToStorage(); };
document.getElementById("setting-zoom").onchange = (e) => { appState.settings.zoom = e.target.value; syncSettingsUI(); saveStateToStorage(); };
document.getElementById("setting-timer-update").onchange = (e) => { appState.settings.timerUpdate = e.target.value; saveStateToStorage(); };

document.getElementById("scramble-type-select").onchange = (e) => { 
    appState.settings.puzzle = e.target.value; 
    saveStateToStorage(); 
    generateScramble(); 
};

// Data Migration Action Links Hooks
document.getElementById("export-native-btn").onclick = () => exportData("native");
document.getElementById("export-cstimer-btn").onclick = () => exportData("cstimer");
document.getElementById("import-file-input").onchange = (e) => handleImportFile(e);

// Session Modification Management Action Elements
document.getElementById("session-select").onchange = (e) => {
    appState.activeSessionName = e.target.value;
    saveStateToStorage();
    refreshSessionView();
};

document.getElementById("new-session-btn").onclick = () => {
    const sName = prompt("Enter Unique Session Label/Name:");
    if (sName && !appState.sessions[sName]) {
        appState.sessions[sName] = [];
        appState.activeSessionName = sName;
        saveStateToStorage();
        populateSessionDropdown();
        refreshSessionView();
    }
};

document.getElementById("rename-session-btn").onclick = () => {
    const current = appState.activeSessionName;
    const updated = prompt("Modify Session Label:", current);
    if (updated && updated !== current && !appState.sessions[updated]) {
        appState.sessions[updated] = appState.sessions[current];
        delete appState.sessions[current];
        appState.activeSessionName = updated;
        saveStateToStorage();
        populateSessionDropdown();
        refreshSessionView();
    }
};

document.getElementById("clear-session-btn").onclick = () => {
    if(confirm("Confirm destructive wipe of active session metrics?")) {
        appState.sessions[appState.activeSessionName] = [];
        saveStateToStorage();
        populateSessionDropdown();
        refreshSessionView();
    }
};

// In-line Instant Penalty Event Handler Binds
document.getElementById("penalty-none-btn").onclick = () => updateLastSolvePenalty("none");
document.getElementById("penalty-plus2-btn").onclick = () => updateLastSolvePenalty("+2");
document.getElementById("penalty-dnf-btn").onclick = () => updateLastSolvePenalty("DNF");
document.getElementById("delete-last-btn").onclick = () => {
    const currentSolves = appState.sessions[appState.activeSessionName] || [];
    if(currentSolves.length > 0) {
        deleteSpecificSolve(currentSolves[currentSolves.length - 1].id);
    }
};

// Keybind Routing Listeners Configuration
window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        e.preventDefault();
        if (document.activeElement.tagName === "SELECT" || document.activeElement.tagName === "INPUT") return;
        handleTimerTrigger();
    }
});

// Run Application Bootstrap Sequence
loadStateFromStorage();
generateScramble();