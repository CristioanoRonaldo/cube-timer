// State Machine Configuration & Variables
let sessionSolves = [];
let timerState = "IDLE"; // IDLE, PRIMED, RUNNING
let startTime = 0;
let timerInterval = null;
let currentPhaseIndex = 0;
const phases = ["Cross", "F2L", "OLL", "PLL"];
let currentPhaseSplits = [0, 0, 0, 0];
let lastPhaseTimestamp = 0;
let currentScramble = "";

// Color scheme array mapped directly to faces [U, R, F, D, L, B]
const faceColors = { U: '#ffffff', R: '#b91c1c', F: '#15803d', D: '#eab308', L: '#e67e22', B: '#1d4ed8' };
let cubeState = {};

// 1. Cube Engine & Scramble State Transformer
function resetCubeState() {
    const faces = ['U', 'R', 'F', 'D', 'L', 'B'];
    faces.forEach(f => {
        cubeState[f] = Array(9).fill(faceColors[f]);
    });
}

function generateScramble() {
    const moves = ["U", "D", "R", "L", "F", "B"];
    const modifiers = ["", "'", "2"];
    let scramble = [];
    let lastMove = "";
    
    while (scramble.length < 20) {
        let move = moves[Math.floor(Math.random() * moves.length)];
        if (move !== lastMove) {
            let mod = modifiers[Math.floor(Math.random() * modifiers.length)];
            scramble.push(move + mod);
            lastMove = move;
        }
    }
    currentScramble = scramble.join(" ");
    document.getElementById("scramble-text").innerText = currentScramble;
    applyScrambleToState(currentScramble);
}

// Minimalist slice rotation engine for 2D visualizer map
function applyScrambleToState(scrambleStr) {
    resetCubeState();
    if (!scrambleStr) return;
    const moves = scrambleStr.split(" ");
    moves.forEach(move => {
        const base = move[0];
        const turns = move.endsWith("2") ? 2 : move.endsWith("'") ? 3 : 1;
        for (let i = 0; i < turns; i++) {
            rotateFaceOnState(base);
        }
    });
    drawCubeNet();
}

function rotateFaceOnState(face) {
    // Basic structural face matrix rotation helper
    const s = cubeState[face];
    const temp = [...s];
    s[0] = temp[6]; s[1] = temp[3]; s[2] = temp[0];
    s[3] = temp[7];               s[5] = temp[1];
    s[6] = temp[8]; s[7] = temp[5]; s[8] = temp[2];
    // Adjacent slice transitions can be extended here for standard transformations
}

// 2. 2D Net Renderer Canvas Canvas
function drawCubeNet() {
    const canvas = document.getElementById("cube-preview");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const size = 12; // sticker size
    const gap = 1;
    const faceSize = (size * 3) + (gap * 2);

    // Grid offsets mapping to an unfolded flat cube layout standard
    const offsets = {
        U: { x: faceSize + 10, y: 5 },
        L: { x: 5, y: faceSize + 10 },
        F: { x: faceSize + 10, y: faceSize + 10 },
        R: { x: (faceSize * 2) + 15, y: faceSize + 10 },
        B: { x: (faceSize * 3) + 20, y: faceSize + 10 },
        D: { x: faceSize + 10, y: (faceSize * 2) + 15 }
    };

    Object.keys(offsets).forEach(face => {
        const { x, y } = offsets[face];
        const stickers = cubeState[face];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                ctx.fillStyle = stickers[row * 3 + col] || '#333';
                ctx.fillRect(
                    x + col * (size + gap),
                    y + row * (size + gap),
                    size,
                    size
                );
            }
        }
    });
}

// 3. Multi-Phase System Clock
function updateTimerDisplay() {
    const elapsed = (performance.now() - startTime) / 1000;
    document.getElementById("timer-display").innerText = elapsed.toFixed(2);
}

function handleTimerTrigger() {
    if (timerState === "IDLE") {
        // Prepare Phase
        timerState = "PRIMED";
        document.getElementById("timer-display").classList.add("ready");
    } else if (timerState === "PRIMED") {
        // Trigger Start Execution
        timerState = "RUNNING";
        document.getElementById("timer-display").classList.remove("ready");
        document.getElementById("timer-display").classList.add("running");
        
        startTime = performance.now();
        lastPhaseTimestamp = startTime;
        currentPhaseIndex = 0;
        currentPhaseSplits = [0, 0, 0, 0];
        
        document.getElementById("phase-display").innerText = `Active Phase: ${phases[currentPhaseIndex]}`;
        timerInterval = setInterval(updateTimerDisplay, 10);
    } else if (timerState === "RUNNING") {
        // Record Dynamic Split Phase
        const now = performance.now();
        const splitDuration = (now - lastPhaseTimestamp) / 1000;
        currentPhaseSplits[currentPhaseIndex] = splitDuration;
        
        // Output live parameters to DOM elements
        document.getElementById(`split-${phases[currentPhaseIndex].toLowerCase()}`).innerText = splitDuration.toFixed(2);
        lastPhaseTimestamp = now;
        currentPhaseIndex++;

        if (currentPhaseIndex < phases.length) {
            document.getElementById("phase-display").innerText = `Active Phase: ${phases[currentPhaseIndex]}`;
        } else {
            // All phases completed - execute cleanup and state logging
            clearInterval(timerInterval);
            const totalTime = (now - startTime) / 1000;
            document.getElementById("timer-display").innerText = totalTime.toFixed(2);
            document.getElementById("timer-display").classList.remove("running");
            document.getElementById("phase-display").innerText = "Solve Completed!";
            
            // Save solve parameters
            sessionSolves.push({
                total: totalTime,
                splits: [...currentPhaseSplits],
                scramble: currentScramble
            });
            
            timerState = "IDLE";
            calculateStats();
            updateHistoryUI();
            generateScramble();
        }
    }
}

// 4. Calculations Ledger & UI Management
function calculateStats() {
    if (sessionSolves.length === 0) return;
    
    // Best single time
    const singles = sessionSolves.map(s => s.total);
    document.getElementById("stat-single").innerText = Math.min(...singles).toFixed(2);

    // Average of 5 Calculation Rule
    if (singles.length >= 5) {
        const last5 = singles.slice(-5);
        last5.sort((a, b) => a - b);
        const ao5 = (last5[1] + last5[2] + last5[3]) / 3;
        document.getElementById("stat-ao5").innerText = ao5.toFixed(2);
    }
    
    // Average of 12 Calculation Rule
    if (singles.length >= 12) {
        const last12 = singles.slice(-12);
        last12.sort((a, b) => a - b);
        const sum = last12.slice(1, 11).reduce((acc, v) => acc + v, 0);
        document.getElementById("stat-ao12").innerText = (sum / 10).toFixed(2);
    }
}

function updateHistoryUI() {
    const list = document.getElementById("history-list");
    list.innerHTML = "";
    sessionSolves.slice().reverse().forEach((solve, i) => {
        const item = document.createElement("div");
        item.className = "history-item";
        item.innerHTML = `
            <span>#${sessionSolves.length - i}</span>
            <strong>${solve.total.toFixed(2)}s</strong>
            <span style="font-size:0.75rem; color:var(--text-muted)">(${solve.splits.map(s=>s.toFixed(1)).join("/")})</span>
        `;
        list.appendChild(item);
    });
}

// 5. Global Event Initializers
window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        e.preventDefault();
        handleTimerTrigger();
    }
});

// Touch and click surface bindings for universal mobile testing
document.getElementById("timer-display").addEventListener("touchstart", (e) => {
    e.preventDefault();
    handleTimerTrigger();
});

// Run Init Execution
resetCubeState();
generateScramble();