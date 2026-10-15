/**
 * ============================================================================
 * TEXAS INSTRUMENTS TI-84 Plus CE NextGen (Python Edition)
 * Engine: Math evaluation, Canvas graphing, Custom keys & Web Audio haptics
 * ============================================================================
 */

(function () {
    "use strict";

    // --- APPLICATION STATE ---
    const state = {
        expression: "",
        ans: 0,
        history: [],
        historyIndex: -1,
        isSecond: false,
        isAlpha: false,
        angleMode: "DEG", // DEG or RAD
        currentView: "calc", // calc, graph, fns
        soundEnabled: true,
        graphRange: { xMin: -10, xMax: 10, yMin: -7, yMax: 7 },
        customKeys: [
            { id: 1, name: "TVA 20%", formula: "* 1.20" },
            { id: 2, name: "Pythagore", formula: "sqrt(3^2 + 4^2)" },
            { id: 3, name: "Δ (b²-4ac)", formula: "b^2 - 4*a*c" },
            { id: 4, name: "Nombre d'Or", formula: "(1 + sqrt(5)) / 2" }
        ]
    };

    // Load persisted custom keys if available
    try {
        const savedCustom = localStorage.getItem("ti84_custom_keys");
        if (savedCustom) {
            state.customKeys = JSON.parse(savedCustom);
        }
    } catch (e) {
        console.warn("Storage access restricted", e);
    }

    // --- DOM REFERENCES ---
    const dom = {
        expressionDisplay: document.getElementById("expressionDisplay"),
        realtimePreview: document.getElementById("realtimePreview"),
        historyList: document.getElementById("historyList"),
        badgeSecond: document.getElementById("badgeSecond"),
        badgeAlpha: document.getElementById("badgeAlpha"),
        angleModeDisplay: document.getElementById("angleModeDisplay"),
        btnToggleAngle: document.getElementById("btnToggleAngle"),
        screenModeLabel: document.getElementById("screenModeLabel"),
        soundToggle: document.getElementById("soundToggle"),
        soundIcon: document.getElementById("soundIcon"),
        calcView: document.getElementById("calcView"),
        graphView: document.getElementById("graphView"),
        fnsView: document.getElementById("fnsView"),
        graphCanvas: document.getElementById("graphCanvas"),
        graphCoords: document.getElementById("graphCoords"),
        activeGraphFnDisplay: document.getElementById("activeGraphFnDisplay"),
        inputY1: document.getElementById("inputY1"),
        inputY2: document.getElementById("inputY2"),
        graphZoomIn: document.getElementById("graphZoomIn"),
        graphZoomOut: document.getElementById("graphZoomOut"),
        graphReset: document.getElementById("graphReset"),
        customModal: document.getElementById("customModal"),
        btnOpenCustomModal: document.getElementById("btnOpenCustomModal"),
        btnCloseCustomModal: document.getElementById("btnCloseCustomModal"),
        btnCancelCustom: document.getElementById("btnCancelCustom"),
        btnSaveCustom: document.getElementById("btnSaveCustom"),
        customConfigList: document.getElementById("customConfigList"),
        c1Name: document.getElementById("c1-name"),
        c2Name: document.getElementById("c2-name"),
        c3Name: document.getElementById("c3-name"),
        c4Name: document.getElementById("c4-name")
    };

    // --- AUDIO SYSTEM (Tactile Haptic Click) ---
    let audioCtx = null;
    function playKeyClick(type = "normal") {
        if (!state.soundEnabled) return;
        try {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) audioCtx = new AudioContextClass();
            }
            if (!audioCtx) return;
            if (audioCtx.state === "suspended") {
                audioCtx.resume();
            }

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            const freq = type === "enter" ? 520 : type === "second" ? 950 : type === "clear" ? 380 : 750;
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.035);

            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + 0.035);
        } catch (e) {
            // Audio not supported or blocked
        }
    }

    // --- MATH EVALUATION ENGINE ---
    function sanitizeExpression(expr) {
        if (!expr) return "";

        let s = expr.trim();

        // Standardize multiplications & divisions
        s = s.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");

        // Constants
        s = s.replace(/\bpi\b|π/gi, "Math.PI");
        s = s.replace(/\bAns\b|\brép\b/gi, `(${state.ans})`);

        // Natural log and Base-10 log
        s = s.replace(/\bln\(/g, "Math.log(");
        s = s.replace(/\blog\(/g, "Math.log10(");

        // Power operator
        s = s.replace(/\^/g, "**");

        // Roots
        s = s.replace(/sqrt\(/g, "Math.sqrt(");
        s = s.replace(/cbrt\(/g, "Math.cbrt(");

        // Abs
        s = s.replace(/abs\(/g, "Math.abs(");

        // Factorial helper replacement: e.g. fact(5)
        s = s.replace(/fact\(([^)]+)\)/g, "tiFact($1)");

        // Trigonometric functions respecting DEG / RAD mode
        if (state.angleMode === "DEG") {
            s = s.replace(/sin\(([^)]+)\)/g, "Math.sin(($1) * Math.PI / 180)");
            s = s.replace(/cos\(([^)]+)\)/g, "Math.cos(($1) * Math.PI / 180)");
            s = s.replace(/tan\(([^)]+)\)/g, "Math.tan(($1) * Math.PI / 180)");
            s = s.replace(/asin\(([^)]+)\)/g, "(Math.asin($1) * 180 / Math.PI)");
            s = s.replace(/acos\(([^)]+)\)/g, "(Math.acos($1) * 180 / Math.PI)");
            s = s.replace(/atan\(([^)]+)\)/g, "(Math.atan($1) * 180 / Math.PI)");
        } else {
            s = s.replace(/sin\(/g, "Math.sin(");
            s = s.replace(/cos\(/g, "Math.cos(");
            s = s.replace(/tan\(/g, "Math.tan(");
            s = s.replace(/asin\(/g, "Math.asin(");
            s = s.replace(/acos\(/g, "Math.acos(");
            s = s.replace(/atan\(/g, "Math.atan(");
        }

        // Implicit multiplications: e.g. 5(3) -> 5*(3), (2)(3) -> (2)*(3), 2Math.PI -> 2*Math.PI
        s = s.replace(/(\d+)\(/g, "$1*(");
        s = s.replace(/\)(\d+)/g, ")*$1");
        s = s.replace(/\)\(/g, ")*(");
        s = s.replace(/(\d+)(Math\.)/g, "$1*$2");

        return s;
    }

    // Factorial helper exposed to evaluation context
    window.tiFact = function (n) {
        n = Math.round(Number(n));
        if (isNaN(n) || n < 0) return NaN;
        if (n > 170) return Infinity;
        let res = 1;
        for (let i = 2; i <= n; i++) res *= i;
        return res;
    };

    function safeEvaluate(expr) {
        if (!expr || expr.trim() === "") return null;
        try {
            const sanitized = sanitizeExpression(expr);
            // Restricted Function execution
            const fn = new Function("tiFact", `"use strict"; return (${sanitized});`);
            const rawVal = fn(window.tiFact);

            if (typeof rawVal !== "number" || isNaN(rawVal)) {
                return "Erreur";
            }
            if (!isFinite(rawVal)) {
                return rawVal > 0 ? "+Infini" : "-Infini";
            }

            // High precision clean rounding (prevents 0.30000000000000004)
            const rounded = Number(Math.round(rawVal + "e12") + "e-12");
            // If very large or tiny, use scientific notation
            if (Math.abs(rounded) >= 1e12 || (Math.abs(rounded) > 0 && Math.abs(rounded) < 1e-6)) {
                return rounded.toExponential(6).replace("e+", "E").replace("e-", "E-");
            }
            return rounded;
        } catch (err) {
            return null; // expression incomplete or invalid
        }
    }

    // --- UI DISPLAY & RENDERING ---
    function updateDisplay() {
        dom.expressionDisplay.textContent = state.expression;
        dom.expressionDisplay.scrollLeft = dom.expressionDisplay.scrollWidth;

        // Mode badges
        if (state.isSecond) {
            dom.badgeSecond.classList.add("active");
            document.body.classList.add("mode-2nd");
        } else {
            dom.badgeSecond.classList.remove("active");
            document.body.classList.remove("mode-2nd");
        }

        if (state.isAlpha) {
            dom.badgeAlpha.classList.add("active");
            document.body.classList.add("mode-alpha");
        } else {
            dom.badgeAlpha.classList.remove("active");
            document.body.classList.remove("mode-alpha");
        }

        dom.angleModeDisplay.textContent = state.angleMode;

        // Realtime preview calculation
        if (state.expression.length > 0) {
            const preview = safeEvaluate(state.expression);
            if (preview !== null && preview !== "Erreur") {
                dom.realtimePreview.textContent = `= ${preview}`;
            } else {
                dom.realtimePreview.textContent = "";
            }
        } else {
            dom.realtimePreview.textContent = "";
        }
    }

    function insertText(str) {
        // If an operator is inserted right after a result, chain it with previous answer
        if (state.expression === "" && ["+", "-", "*", "/", "^", "%"].includes(str)) {
            state.expression = `Ans ${str} `;
        } else {
            state.expression += str;
        }
        state.historyIndex = -1;
        updateDisplay();
    }

    function backspace() {
        if (state.expression.length > 0) {
            // If ending with a multi-char token like 'sin(' or 'Ans '
            const multiTokens = ["sin(", "cos(", "tan(", "asin(", "acos(", "atan(", "sqrt(", "cbrt(", "log(", "ln(", "abs(", "fact(", "Ans "];
            let removed = false;
            for (const token of multiTokens) {
                if (state.expression.endsWith(token)) {
                    state.expression = state.expression.slice(0, -token.length);
                    removed = true;
                    break;
                }
            }
            if (!removed) {
                state.expression = state.expression.slice(0, -1);
            }
            updateDisplay();
        }
    }

    function clearEntry() {
        if (state.expression !== "") {
            state.expression = "";
        } else {
            // Clear history if already empty
            state.history = [];
            renderHistory();
        }
        updateDisplay();
    }

    function executeEvaluation() {
        if (!state.expression.trim()) return;

        const expr = state.expression;
        const res = safeEvaluate(expr);

        const finalResult = res !== null ? res : "ERR: SYNTAXE";

        // Add to history
        state.history.push({ expr, result: finalResult });
        if (res !== null && typeof res === "number") {
            state.ans = res;
        }

        // Reset current entry
        state.expression = "";
        state.historyIndex = -1;
        renderHistory();
        updateDisplay();

        // Switch to calc view if not already
        if (state.currentView !== "calc") {
            switchView("calc");
        }
    }

    function renderHistory() {
        if (state.history.length === 0) {
            dom.historyList.innerHTML = `
                <div class="history-welcome">
                    <div class="welcome-title">TI-84 Plus CE NextGen</div>
                    <div class="welcome-sub">Prêt pour calculs & fonctions graphiques</div>
                </div>
            `;
            return;
        }

        dom.historyList.innerHTML = "";
        state.history.forEach((item, index) => {
            const div = document.createElement("div");
            div.className = "history-item";
            div.innerHTML = `
                <div class="history-expr">${escapeHtml(item.expr)}</div>
                <div class="history-res">${escapeHtml(String(item.result))}</div>
            `;
            div.addEventListener("click", () => {
                // Recall expression or result
                state.expression = item.expr;
                updateDisplay();
                playKeyClick();
            });
            dom.historyList.appendChild(div);
        });

        dom.historyList.scrollTop = dom.historyList.scrollHeight;
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // --- VIEW SWITCHING ---
    function switchView(viewName) {
        state.currentView = viewName;
        dom.calcView.classList.remove("active");
        dom.graphView.classList.remove("active");
        dom.fnsView.classList.remove("active");

        if (viewName === "calc") {
            dom.calcView.classList.add("active");
            dom.screenModeLabel.textContent = "CALC";
        } else if (viewName === "graph") {
            dom.graphView.classList.add("active");
            dom.screenModeLabel.textContent = "GRAPHE";
            drawGraph();
        } else if (viewName === "fns") {
            dom.fnsView.classList.add("active");
            dom.screenModeLabel.textContent = "Y=";
        }
    }

    // --- GRAPH ENGINE (CANVAS) ---
    function drawGraph() {
        const canvas = dom.graphCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;

        const { xMin, xMax, yMin, yMax } = state.graphRange;

        // Clear background
        ctx.fillStyle = "#090d14";
        ctx.fillRect(0, 0, w, h);

        // Transformation helper functions
        const toScreenX = (x) => ((x - xMin) / (xMax - xMin)) * w;
        const toScreenY = (y) => h - ((y - yMin) / (yMax - yMin)) * h;

        // 1. Draw Grid Lines
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;

        // Vertical grid lines
        for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
            const sx = toScreenX(x);
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, h);
            ctx.stroke();
        }
        // Horizontal grid lines
        for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
            const sy = toScreenY(y);
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(w, sy);
            ctx.stroke();
        }

        // 2. Main Axes (X & Y)
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.5;

        // X Axis
        const originY = toScreenY(0);
        if (originY >= 0 && originY <= h) {
            ctx.beginPath();
            ctx.moveTo(0, originY);
            ctx.lineTo(w, originY);
            ctx.stroke();
        }

        // Y Axis
        const originX = toScreenX(0);
        if (originX >= 0 && originX <= w) {
            ctx.beginPath();
            ctx.moveTo(originX, 0);
            ctx.lineTo(originX, h);
            ctx.stroke();
        }

        // 3. Plot Functions (Y1 and Y2)
        const fnY1 = dom.inputY1.value.trim();
        const fnY2 = dom.inputY2.value.trim();

        dom.activeGraphFnDisplay.textContent = `Y1 = ${fnY1 || "---"}`;

        if (fnY1) plotFunction(ctx, fnY1, "#38bdf8", w, h);
        if (fnY2) plotFunction(ctx, fnY2, "#f43f5e", w, h);
    }

    function plotFunction(ctx, exprStr, color, w, h) {
        const { xMin, xMax, yMin, yMax } = state.graphRange;
        const toScreenX = (x) => ((x - xMin) / (xMax - xMin)) * w;
        const toScreenY = (y) => h - ((y - yMin) / (yMax - yMin)) * h;

        // Prepare sanitized expression for X evaluation
        // Replace variable X with argument
        const step = (xMax - xMin) / w;
        let lastValidY = null;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        let started = false;

        for (let px = 0; px <= w; px++) {
            const x = xMin + px * step;
            // Build expression replacing X (or x) with numerical value
            const substituted = exprStr.replace(/\bX\b|\bx\b/g, `(${x})`);
            const y = safeEvaluate(substituted);

            if (typeof y === "number" && !isNaN(y) && isFinite(y)) {
                // Avoid drawing lines across asymptotic jumps (e.g. tan(x))
                if (lastValidY !== null && Math.abs(y - lastValidY) > (yMax - yMin) * 2) {
                    started = false;
                }

                const sy = toScreenY(y);
                if (!started) {
                    ctx.moveTo(px, sy);
                    started = true;
                } else {
                    ctx.lineTo(px, sy);
                }
                lastValidY = y;
            } else {
                started = false;
                lastValidY = null;
            }
        }

        ctx.stroke();
    }

    // Canvas Mouse Tracker for Coordinates
    dom.graphCanvas.addEventListener("mousemove", (e) => {
        const rect = dom.graphCanvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const w = dom.graphCanvas.width;
        const h = dom.graphCanvas.height;

        const { xMin, xMax, yMin, yMax } = state.graphRange;
        const xVal = (xMin + (px / w) * (xMax - xMin)).toFixed(2);
        const yVal = (yMax - (py / h) * (yMax - yMin)).toFixed(2);

        dom.graphCoords.textContent = `X: ${xVal} | Y: ${yVal}`;
    });

    // Zoom buttons
    dom.graphZoomIn.addEventListener("click", () => {
        state.graphRange.xMin *= 0.7;
        state.graphRange.xMax *= 0.7;
        state.graphRange.yMin *= 0.7;
        state.graphRange.yMax *= 0.7;
        drawGraph();
        playKeyClick();
    });

    dom.graphZoomOut.addEventListener("click", () => {
        state.graphRange.xMin *= 1.4;
        state.graphRange.xMax *= 1.4;
        state.graphRange.yMin *= 1.4;
        state.graphRange.yMax *= 1.4;
        drawGraph();
        playKeyClick();
    });

    dom.graphReset.addEventListener("click", () => {
        state.graphRange = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 };
        drawGraph();
        playKeyClick();
    });

    // --- CUSTOM KEYS SYSTEM ---
    function renderCustomKeyLabels() {
        dom.c1Name.textContent = state.customKeys[0]?.name || "C1";
        dom.c2Name.textContent = state.customKeys[1]?.name || "C2";
        dom.c3Name.textContent = state.customKeys[2]?.name || "C3";
        dom.c4Name.textContent = state.customKeys[3]?.name || "C4";
    }

    function handleCustomKeyClick(index) {
        const item = state.customKeys[index];
        if (!item || !item.formula) return;

        playKeyClick("enter");

        const formula = item.formula.trim();
        // If formula starts with an operator (+, -, *, /), append it to current expression or Ans
        if (/^[+\-*/^%]/.test(formula)) {
            if (state.expression === "") {
                insertText(`Ans ${formula} `);
            } else {
                insertText(` ${formula} `);
            }
        } else {
            // Insert formula directly
            insertText(formula);
        }
    }

    function openCustomModal() {
        playKeyClick();
        dom.customConfigList.innerHTML = "";
        state.customKeys.forEach((key, idx) => {
            const row = document.createElement("div");
            row.className = "custom-config-row";
            row.innerHTML = `
                <div class="custom-badge">C${idx + 1}</div>
                <div class="custom-inputs">
                    <div class="custom-input-group">
                        <label>Nom de la touche</label>
                        <input type="text" id="cfgName${idx}" value="${escapeHtml(key.name)}" maxlength="16">
                    </div>
                    <div class="custom-input-group">
                        <label>Formule / Macro</label>
                        <input type="text" id="cfgFormula${idx}" value="${escapeHtml(key.formula)}">
                    </div>
                </div>
            `;
            dom.customConfigList.appendChild(row);
        });
        dom.customModal.classList.add("open");
    }

    function closeCustomModal() {
        playKeyClick();
        dom.customModal.classList.remove("open");
    }

    function saveCustomKeys() {
        for (let i = 0; i < 4; i++) {
            const nameEl = document.getElementById(`cfgName${i}`);
            const formulaEl = document.getElementById(`cfgFormula${i}`);
            if (nameEl && formulaEl) {
                state.customKeys[i].name = nameEl.value.trim() || `C${i + 1}`;
                state.customKeys[i].formula = formulaEl.value.trim();
            }
        }
        try {
            localStorage.setItem("ti84_custom_keys", JSON.stringify(state.customKeys));
        } catch (e) {
            console.warn("Storage save error", e);
        }
        renderCustomKeyLabels();
        closeCustomModal();
    }

    // Modal Presets
    const presetsData = {
        finance: [
            { id: 1, name: "TVA 20%", formula: "* 1.20" },
            { id: 2, name: "TVA 5.5%", formula: "* 1.055" },
            { id: 3, name: "Remise -20%", formula: "* 0.80" },
            { id: 4, name: "Marge 30%", formula: "* 1.30" }
        ],
        maths: [
            { id: 1, name: "Pythagore", formula: "sqrt(3^2 + 4^2)" },
            { id: 2, name: "Δ (b²-4ac)", formula: "b^2 - 4*a*c" },
            { id: 3, name: "Nombre d'Or", formula: "(1 + sqrt(5)) / 2" },
            { id: 4, name: "Sphère V", formula: "(4/3) * pi * 5^3" }
        ],
        physics: [
            { id: 1, name: "Célérité c", formula: "299792458" },
            { id: 2, name: "Gravité g", formula: "9.80665" },
            { id: 3, name: "Planck h", formula: "6.626e-34" },
            { id: 4, name: "Avogadro", formula: "6.022e23" }
        ]
    };

    document.querySelectorAll(".preset-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
            playKeyClick();
            const type = pill.dataset.preset;
            if (presetsData[type]) {
                presetsData[type].forEach((item, idx) => {
                    const nameEl = document.getElementById(`cfgName${idx}`);
                    const formulaEl = document.getElementById(`cfgFormula${idx}`);
                    if (nameEl) nameEl.value = item.name;
                    if (formulaEl) formulaEl.value = item.formula;
                });
            }
        });
    });

    // --- KEYPAD EVENT DISPATCHER ---
    document.querySelectorAll(".key").forEach((key) => {
        key.addEventListener("click", (e) => {
            const target = key;
            const insert = target.getAttribute("data-insert");
            const secondVal = target.getAttribute("data-second");
            const alphaVal = target.getAttribute("data-alpha");
            const action = target.getAttribute("data-action");
            const customIdx = target.getAttribute("data-custom-index");

            // Custom keys
            if (customIdx !== null) {
                handleCustomKeyClick(parseInt(customIdx, 10));
                return;
            }

            // Actions
            if (action) {
                handleAction(action);
                return;
            }

            // 2nd Mode value replacement
            if (state.isSecond && secondVal) {
                playKeyClick("second");
                if (secondVal === "pi") insertText("π");
                else if (secondVal === "ans") insertText("Ans");
                else if (secondVal === "sqrt(") insertText("sqrt(");
                else if (secondVal === "10^(") insertText("10^(");
                else if (secondVal === "e^(") insertText("e^(");
                else if (secondVal === "e") insertText("Math.E");
                else insertText(secondVal);

                state.isSecond = false;
                updateDisplay();
                return;
            }

            // Alpha Mode value replacement
            if (state.isAlpha && alphaVal) {
                playKeyClick("normal");
                insertText(alphaVal);
                state.isAlpha = false;
                updateDisplay();
                return;
            }

            // Normal insertion
            if (insert) {
                playKeyClick("normal");
                insertText(insert);
            }
        });
    });

    function handleAction(action) {
        switch (action) {
            case "toggle-second":
                state.isSecond = !state.isSecond;
                state.isAlpha = false;
                playKeyClick("second");
                updateDisplay();
                break;
            case "toggle-alpha":
                state.isAlpha = !state.isAlpha;
                state.isSecond = false;
                playKeyClick("normal");
                updateDisplay();
                break;
            case "toggle-angle":
                state.angleMode = state.angleMode === "DEG" ? "RAD" : "DEG";
                playKeyClick("normal");
                updateDisplay();
                if (state.currentView === "graph") drawGraph();
                break;
            case "del":
                playKeyClick("normal");
                backspace();
                break;
            case "clear":
                playKeyClick("clear");
                clearEntry();
                break;
            case "evaluate":
                playKeyClick("enter");
                executeEvaluation();
                break;
            case "reset":
                playKeyClick("clear");
                state.expression = "";
                state.isSecond = false;
                state.isAlpha = false;
                switchView("calc");
                updateDisplay();
                break;
            case "insert-ans":
                playKeyClick("normal");
                insertText("Ans");
                break;
            case "insert-pi":
                playKeyClick("normal");
                insertText("π");
                break;
            case "view-fns":
                playKeyClick("normal");
                switchView("fns");
                break;
            case "toggle-graph":
                playKeyClick("normal");
                if (state.currentView === "graph") {
                    switchView("calc");
                } else {
                    switchView("graph");
                }
                break;
            case "view-window":
            case "view-zoom":
            case "view-trace":
                playKeyClick("normal");
                switchView("graph");
                break;
            default:
                break;
        }
    }

    // D-Pad Navigation Buttons
    dom.btnToggleAngle.addEventListener("click", () => {
        handleAction("toggle-angle");
    });

    document.getElementById("dpadUp").addEventListener("click", () => {
        playKeyClick("normal");
        if (state.history.length > 0) {
            if (state.historyIndex === -1) {
                state.historyIndex = state.history.length - 1;
            } else if (state.historyIndex > 0) {
                state.historyIndex--;
            }
            state.expression = state.history[state.historyIndex].expr;
            updateDisplay();
        }
    });

    document.getElementById("dpadDown").addEventListener("click", () => {
        playKeyClick("normal");
        if (state.history.length > 0 && state.historyIndex !== -1) {
            if (state.historyIndex < state.history.length - 1) {
                state.historyIndex++;
                state.expression = state.history[state.historyIndex].expr;
            } else {
                state.historyIndex = -1;
                state.expression = "";
            }
            updateDisplay();
        }
    });

    document.getElementById("dpadLeft").addEventListener("click", () => {
        playKeyClick("normal");
        dom.expressionDisplay.scrollLeft -= 30;
    });

    document.getElementById("dpadRight").addEventListener("click", () => {
        playKeyClick("normal");
        dom.expressionDisplay.scrollLeft += 30;
    });

    // Sound toggle button
    dom.soundToggle.addEventListener("click", () => {
        state.soundEnabled = !state.soundEnabled;
        dom.soundIcon.textContent = state.soundEnabled ? "🔊" : "🔇";
        if (state.soundEnabled) playKeyClick();
    });

    // Custom Modal Events
    dom.btnOpenCustomModal.addEventListener("click", openCustomModal);
    dom.btnCloseCustomModal.addEventListener("click", closeCustomModal);
    dom.btnCancelCustom.addEventListener("click", closeCustomModal);
    dom.btnSaveCustom.addEventListener("click", saveCustomKeys);

    // --- HARDWARE KEYBOARD EVENT LISTENER ---
    window.addEventListener("keydown", (e) => {
        // Prevent key interference when modal or function input is active
        if (dom.customModal.classList.contains("open") || document.activeElement.tagName === "INPUT") {
            return;
        }

        const key = e.key;
        if ((key >= "0" && key <= "9") || [".", "+", "-", "*", "/", "(", ")", "^", "%"].includes(key)) {
            e.preventDefault();
            playKeyClick("normal");
            insertText(key);
        } else if (key === "Enter" || key === "=") {
            e.preventDefault();
            playKeyClick("enter");
            executeEvaluation();
        } else if (key === "Backspace") {
            e.preventDefault();
            playKeyClick("normal");
            backspace();
        } else if (key === "Escape" || key === "Delete") {
            e.preventDefault();
            playKeyClick("clear");
            clearEntry();
        } else if (key === "ArrowUp") {
            e.preventDefault();
            document.getElementById("dpadUp").click();
        } else if (key === "ArrowDown") {
            e.preventDefault();
            document.getElementById("dpadDown").click();
        } else if (key.toLowerCase() === "x") {
            e.preventDefault();
            playKeyClick("normal");
            insertText("X");
        }
    });

    // --- INITIALIZATION ---
    renderCustomKeyLabels();
    renderHistory();
    updateDisplay();

})();