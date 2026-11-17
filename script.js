// --- CONFIGURAZIONE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDGATUtn1NJdWrfkwz58JLFXUntNlh07Qg",
    authDomain: "bianco-o-nero.firebaseapp.com",
    projectId: "bianco-o-nero",
    storageBucket: "bianco-o-nero.firebasestorage.app",
    messagingSenderId: "214158255418",
    appId: "1:214158255418:web:48d91df8dec795c7169c03",
    measurementId: "G-VRPYXFF0GR"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- COSTANTI & STATO DI GIOCO ---
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

const DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
];

const POSITION_WEIGHTS = [
    [120, -20, 20, 5, 5, 20, -20, 120],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [120, -20, 20, 5, 5, 20, -20, 120]
];

let gameState = {
    mode: 'single',
    difficulty: 'medium',
    playerName: '',
    opponentName: 'Computer',
    myColor: BLACK,
    blackName: '',
    whiteName: '',
    board: [],
    currentTurn: BLACK,
    lastMove: null,
    flippedCells: [],
    roomCode: '',
    playerRoleInRoom: '',
    roomRef: null,
    soundEnabled: true,
    isProcessing: false,
    winsP1: 0,
    winsP2: 0
};

// --- AUDIO ENGINE ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (!gameState.soundEnabled) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'place') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(65, now + 0.09);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'flip') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.06);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.07);
    } else if (type === 'coin') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(980, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.18);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554, now + 0.12);
        osc.frequency.setValueAtTime(659, now + 0.24);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.46);
    }
}

function toggleSound() {
    gameState.soundEnabled = !gameState.soundEnabled;
    document.getElementById('sound-btn').textContent = gameState.soundEnabled ? '🔊' : '🔇';
}

// --- MONITOR CONNESSIONE ---
db.ref('.info/connected').on('value', (snap) => {
    const dot = document.getElementById('fb-dot');
    const status = document.getElementById('fb-status');
    if (snap.val() === true) {
        dot.classList.add('online');
        status.textContent = 'Server Online Pronto';
    } else {
        dot.classList.remove('online');
        status.textContent = 'Connessione al server...';
    }
});

// --- LOBBY ---
const nameInput = document.getElementById('player-name');
const roomInput = document.getElementById('room-code');

nameInput.addEventListener('input', validateLobbyInputs);
roomInput.addEventListener('input', validateLobbyInputs);

function validateLobbyInputs() {
    const nameValid = nameInput.value.trim().length > 0;
    const roomValid = roomInput.value.trim().length > 0;

    document.getElementById('btn-start-single').disabled = !nameValid;
    document.getElementById('btn-join-room').disabled = !(nameValid && roomValid);
}

function selectMode(mode) {
    gameState.mode = mode;
    document.getElementById('tab-single').classList.toggle('active', mode === 'single');
    document.getElementById('tab-multi').classList.toggle('active', mode === 'multi');

    document.getElementById('single-options').classList.toggle('hidden', mode !== 'single');
    document.getElementById('multi-options').classList.toggle('hidden', mode !== 'multi');
    validateLobbyInputs();
}

function selectDifficulty(diff) {
    gameState.difficulty = diff;
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.diff === diff);
    });
}

function generateRoomCode() {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    roomInput.value = code;
    validateLobbyInputs();
}

function initSinglePlayer() {
    nameInput.blur();
    gameState.playerName = nameInput.value.trim();
    const diffNames = { easy: 'Facile', medium: 'Medio', hard: 'Difficile' };
    gameState.opponentName = `Computer (${diffNames[gameState.difficulty]})`;

    gameState.winsP1 = 0;
    gameState.winsP2 = 0;

    const userIsBlack = Math.random() < 0.5;
    setupRolesAndToss(gameState.playerName, gameState.opponentName, userIsBlack);
}

function setupRolesAndToss(p1, p2, p1IsBlack) {
    gameState.blackName = p1IsBlack ? p1 : p2;
    gameState.whiteName = p1IsBlack ? p2 : p1;
    gameState.myColor = (gameState.blackName === gameState.playerName) ? BLACK : WHITE;

    openCoinTossModal(p1, p2, gameState.blackName);
}

// --- MULTIPLAYER ---
async function joinMultiplayerRoom() {
    nameInput.blur();
    roomInput.blur();

    const pName = nameInput.value.trim();
    const code = roomInput.value.trim().toUpperCase();
    gameState.playerName = pName;
    gameState.roomCode = code;

    const btnJoin = document.getElementById('btn-join-room');
    const waitingMsg = document.getElementById('waiting-msg');
    btnJoin.disabled = true;

    const roomRef = db.ref(`rooms/${code}`);
    gameState.roomRef = roomRef;

    const snapshot = await roomRef.once('value');
    const roomData = snapshot.val();

    if (!roomData || roomData.status === 'abandoned' || !roomData.host) {
        gameState.playerRoleInRoom = 'host';
        gameState.winsP1 = 0;
        gameState.winsP2 = 0;

        await roomRef.set({
            status: 'waiting',
            host: pName,
            guest: null,
            blackPlayer: null,
            whitePlayer: null,
            board: createInitialBoard(),
            currentTurn: BLACK,
            lastMove: null,
            flippedCells: [],
            winsHost: 0,
            winsGuest: 0,
            rematchTimestamp: 0,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });

        waitingMsg.textContent = `Stanza ${code} creata. In attesa dell'avversario...`;
        waitingMsg.classList.remove('hidden');

        roomRef.on('value', (snap) => {
            const data = snap.val();
            if (!data) return;

            if (data.status === 'ready' && data.guest && data.blackPlayer) {
                waitingMsg.classList.add('hidden');
                gameState.opponentName = data.guest;
                gameState.blackName = data.blackPlayer;
                gameState.whiteName = data.whitePlayer;
                gameState.myColor = (data.blackPlayer === pName) ? BLACK : WHITE;
                gameState.winsP1 = data.winsHost || 0;
                gameState.winsP2 = data.winsGuest || 0;

                if (document.getElementById('coin-modal').classList.contains('hidden') &&
                    !document.getElementById('game-screen').classList.contains('active')) {
                    openCoinTossModal(data.host, data.guest, data.blackPlayer);
                }
            }
        });

    } else if (roomData.status === 'waiting' && !roomData.guest) {
        gameState.playerRoleInRoom = 'guest';
        const hostName = roomData.host;
        const guestName = (hostName === pName) ? `${pName} (2)` : pName;
        gameState.playerName = guestName;
        gameState.opponentName = hostName;
        gameState.winsP1 = roomData.winsHost || 0;
        gameState.winsP2 = roomData.winsGuest || 0;

        const hostIsBlack = Math.random() < 0.5;
        const blackPlayer = hostIsBlack ? hostName : guestName;
        const whitePlayer = hostIsBlack ? guestName : hostName;

        gameState.blackName = blackPlayer;
        gameState.whiteName = whitePlayer;
        gameState.myColor = (blackPlayer === guestName) ? BLACK : WHITE;

        await roomRef.update({
            status: 'ready',
            guest: guestName,
            blackPlayer: blackPlayer,
            whitePlayer: whitePlayer,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });

        openCoinTossModal(hostName, guestName, blackPlayer);
    } else {
        alert('Stanza già piena o partita in corso!');
        btnJoin.disabled = false;
    }
}

// --- POPUP SORTEGGIO CORRETTO ---
function openCoinTossModal(p1, p2, blackPlayerName) {
    const modal = document.getElementById('coin-modal');
    const coin = document.getElementById('spinning-coin');
    const statusText = document.getElementById('toss-status');
    const rolesBox = document.getElementById('assigned-roles');
    const btnGo = document.getElementById('btn-go-game');

    document.getElementById('toss-p1').textContent = p1;
    document.getElementById('toss-p2').textContent = p2;

    rolesBox.classList.add('hidden');
    btnGo.disabled = true;
    statusText.textContent = 'La pedina sta girando...';
    coin.style.transform = '';
    coin.classList.add('spinning');

    modal.classList.remove('hidden');
    playSound('coin');

    setTimeout(() => {
        coin.classList.remove('spinning');

        // Se a iniziare è il primo giocatore (p1), mostra la faccia frontale (Nero -> 0deg),
        // altrimenti mostra la faccia posteriore (Bianco -> 180deg)
        if (blackPlayerName === p1) {
            coin.style.transform = 'rotateY(0deg)';
        } else {
            coin.style.transform = 'rotateY(180deg)';
        }

        playSound('place');
        statusText.textContent = `Sorteggio completato! Inizia ${blackPlayerName}.`;
        document.getElementById('black-player-name').textContent = blackPlayerName;

        const whitePlayerName = (blackPlayerName === p1) ? p2 : p1;
        document.getElementById('white-player-name').textContent = whitePlayerName;

        rolesBox.classList.remove('hidden');
        btnGo.disabled = false;
    }, 2200);
}

function enterGameScreen() {
    document.getElementById('coin-modal').classList.add('hidden');
    document.getElementById('gameover-modal').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    document.getElementById('label-black-name').textContent = gameState.blackName;
    document.getElementById('label-white-name').textContent = gameState.whiteName;

    if (gameState.mode === 'multi') {
        document.getElementById('room-indicator').textContent = `Stanza: ${gameState.roomCode}`;
        setupMultiplayerListener();
    } else {
        document.getElementById('room-indicator').textContent = 'Partita Locale';
        startNewBoardGame();
    }
}

function createInitialBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
    b[3][3] = WHITE;
    b[3][4] = BLACK;
    b[4][3] = BLACK;
    b[4][4] = WHITE;
    return b;
}

function startNewBoardGame() {
    gameState.isProcessing = false;
    gameState.board = createInitialBoard();
    gameState.currentTurn = BLACK;
    gameState.lastMove = null;
    gameState.flippedCells = [];
    renderBoard();

    if (gameState.mode === 'single' && gameState.myColor === WHITE) {
        triggerAIMove();
    }
}

// --- LOGICA OTHELLO ---
function getFlippableDiscs(board, row, col, color) {
    if (board[row][col] !== EMPTY) return [];
    const opponent = (color === BLACK) ? WHITE : BLACK;
    let totalFlipped = [];

    for (const [dr, dc] of DIRECTIONS) {
        let r = row + dr;
        let c = col + dc;
        let line = [];

        while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === opponent) {
            line.push([r, c]);
            r += dr;
            c += dc;
        }

        if (line.length > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === color) {
            totalFlipped = totalFlipped.concat(line);
        }
    }
    return totalFlipped;
}

function getValidMoves(board, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const flipped = getFlippableDiscs(board, r, c, color);
            if (flipped.length > 0) {
                moves.push({ row: r, col: c, flipped });
            }
        }
    }
    return moves;
}

function cloneBoard(board) {
    return board.map(row => [...row]);
}

function countPieces(board) {
    let black = 0, white = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === BLACK) black++;
            else if (board[r][c] === WHITE) white++;
        }
    }
    return { black, white };
}

async function handleCellClick(row, col) {
    if (gameState.isProcessing) return;
    if (gameState.currentTurn !== gameState.myColor) return;

    const flipped = getFlippableDiscs(gameState.board, row, col, gameState.myColor);
    if (flipped.length === 0) return;

    await applyMove(row, col, gameState.myColor, flipped);
}

async function applyMove(row, col, color, flipped) {
    gameState.isProcessing = true;

    gameState.board[row][col] = color;
    flipped.forEach(([r, c]) => { gameState.board[r][c] = color; });

    gameState.lastMove = [row, col];
    gameState.flippedCells = flipped;

    playSound('place');
    setTimeout(() => playSound('flip'), 120);

    const nextColor = (color === BLACK) ? WHITE : BLACK;
    const nextMoves = getValidMoves(gameState.board, nextColor);
    const currentMoves = getValidMoves(gameState.board, color);

    let newTurn = nextColor;
    let statusNote = 'Posiziona la tua pedina';
    let isGameOver = false;

    if (nextMoves.length === 0) {
        if (currentMoves.length === 0) {
            isGameOver = true;
            statusNote = 'Fine partita!';
        } else {
            newTurn = color;
            const skippedName = (nextColor === BLACK) ? gameState.blackName : gameState.whiteName;
            statusNote = `${skippedName} non ha mosse e passa!`;
        }
    }

    gameState.currentTurn = newTurn;

    if (gameState.mode === 'multi' && gameState.roomRef) {
        await gameState.roomRef.update({
            board: gameState.board,
            currentTurn: newTurn,
            lastMove: [row, col],
            flippedCells: flipped,
            statusNote: statusNote,
            status: isGameOver ? 'finished' : 'playing',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
    }

    renderBoard(statusNote);

    if (isGameOver) {
        showGameOver();
        return;
    }

    if (gameState.mode === 'single' && gameState.currentTurn !== gameState.myColor) {
        triggerAIMove();
    } else {
        gameState.isProcessing = false;
    }
}

// --- MULTIPLAYER LISTENER ---
function setupMultiplayerListener() {
    let lastRematchTimestamp = 0;

    gameState.roomRef.off();
    gameState.roomRef.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;

        if (data.status === 'abandoned') {
            alert('L\'avversario ha abbandonato la partita.');
            resetToLobby();
            return;
        }

        if (data.rematchTimestamp && data.rematchTimestamp !== lastRematchTimestamp) {
            lastRematchTimestamp = data.rematchTimestamp;
            gameState.blackName = data.blackPlayer;
            gameState.whiteName = data.whitePlayer;
            gameState.myColor = (data.blackPlayer === gameState.playerName) ? BLACK : WHITE;
            gameState.winsP1 = data.winsHost || 0;
            gameState.winsP2 = data.winsGuest || 0;

            document.getElementById('gameover-modal').classList.add('hidden');

            const p1Name = (gameState.playerRoleInRoom === 'host') ? data.host : data.guest;
            const p2Name = (gameState.playerRoleInRoom === 'host') ? data.guest : data.host;

            openCoinTossModal(p1Name, p2Name, gameState.blackName);
            return;
        }

        if (data.board && data.status !== 'finished') {
            const turnChanged = gameState.lastMove?.[0] !== data.lastMove?.[0] ||
                gameState.lastMove?.[1] !== data.lastMove?.[1];
            if (turnChanged && data.lastMove) playSound('place');

            gameState.board = data.board;
            gameState.currentTurn = data.currentTurn;
            gameState.lastMove = data.lastMove || null;
            gameState.flippedCells = data.flippedCells || [];

            renderBoard(data.statusNote || 'Posiziona la tua pedina');

            if (data.status === 'finished') {
                showGameOver();
            }
        }
    });
}

// --- IA ---
function triggerAIMove() {
    gameState.isProcessing = true;
    document.getElementById('game-message').textContent = 'Il Computer sta pensando...';

    setTimeout(() => {
        const aiColor = gameState.currentTurn;
        const validMoves = getValidMoves(gameState.board, aiColor);
        if (validMoves.length === 0) {
            gameState.isProcessing = false;
            return;
        }

        let chosenMove;
        if (gameState.difficulty === 'easy') {
            chosenMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        } else if (gameState.difficulty === 'medium') {
            let bestScore = -Infinity;
            for (const move of validMoves) {
                const score = POSITION_WEIGHTS[move.row][move.col] + (move.flipped.length * 2);
                if (score > bestScore) {
                    bestScore = score;
                    chosenMove = move;
                }
            }
        } else {
            let bestScore = -Infinity;
            for (const move of validMoves) {
                const simBoard = simulateMove(gameState.board, move, aiColor);
                const score = minimax(simBoard, 3, -Infinity, Infinity, false, aiColor);
                if (score > bestScore) {
                    bestScore = score;
                    chosenMove = move;
                }
            }
        }

        applyMove(chosenMove.row, chosenMove.col, aiColor, chosenMove.flipped);
    }, 650);
}

function simulateMove(board, move, color) {
    const copy = cloneBoard(board);
    copy[move.row][move.col] = color;
    move.flipped.forEach(([r, c]) => { copy[r][c] = color; });
    return copy;
}

function evaluateBoard(board, aiColor) {
    const oppColor = (aiColor === BLACK) ? WHITE : BLACK;
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === aiColor) score += POSITION_WEIGHTS[r][c];
            else if (board[r][c] === oppColor) score -= POSITION_WEIGHTS[r][c];
        }
    }
    return score;
}

function minimax(board, depth, alpha, beta, isMaximizing, aiColor) {
    const oppColor = (aiColor === BLACK) ? WHITE : BLACK;
    const currentColor = isMaximizing ? aiColor : oppColor;
    const moves = getValidMoves(board, currentColor);

    if (depth === 0 || moves.length === 0) return evaluateBoard(board, aiColor);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const nextBoard = simulateMove(board, move, aiColor);
            const ev = minimax(nextBoard, depth - 1, alpha, beta, false, aiColor);
            maxEval = Math.max(maxEval, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const nextBoard = simulateMove(board, move, oppColor);
            const ev = minimax(nextBoard, depth - 1, alpha, beta, true, aiColor);
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

// --- RENDERING ---
function renderBoard(statusNote = 'Posiziona la tua pedina') {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    const validMoves = getValidMoves(gameState.board, gameState.currentTurn);
    const isMyTurn = (gameState.currentTurn === gameState.myColor);

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';

            const val = gameState.board[r][c];
            const isValid = isMyTurn && validMoves.some(m => m.row === r && m.col === c);

            if (isValid) {
                cell.classList.add('valid-move');
                cell.onclick = () => handleCellClick(r, c);
            }

            if (val !== EMPTY) {
                const piece = document.createElement('div');
                piece.className = `piece ${val === BLACK ? 'black' : 'white'}`;

                if (gameState.lastMove && gameState.lastMove[0] === r && gameState.lastMove[1] === c) {
                    piece.classList.add('last-move');
                }
                if (gameState.flippedCells.some(([fr, fc]) => fr === r && fc === c)) {
                    piece.classList.add('flipped');
                }
                cell.appendChild(piece);
            }

            boardEl.appendChild(cell);
        }
    }

    const counts = countPieces(gameState.board);
    document.getElementById('score-black').textContent = counts.black;
    document.getElementById('score-white').textContent = counts.white;
    document.getElementById('valid-moves-count').textContent = validMoves.length;

    const currentName = (gameState.currentTurn === BLACK) ? gameState.blackName : gameState.whiteName;
    document.getElementById('current-turn-name').textContent = currentName;

    const turnIcon = document.getElementById('turn-disc-icon');
    turnIcon.className = `mini-disc ${gameState.currentTurn === BLACK ? 'black' : 'white'}`;

    document.getElementById('card-black').classList.toggle('active-turn', gameState.currentTurn === BLACK);
    document.getElementById('card-white').classList.toggle('active-turn', gameState.currentTurn === WHITE);

    const msgEl = document.getElementById('game-message');
    if (statusNote.includes('passa')) {
        msgEl.textContent = statusNote;
    } else {
        msgEl.textContent = isMyTurn ? 'Tocca a te!' : `Attendi mossa di ${currentName}...`;
    }
}

// --- RIVINCITA E FINE PARTITA ---
function showGameOver() {
    playSound('win');
    const counts = countPieces(gameState.board);
    document.getElementById('final-black').textContent = counts.black;
    document.getElementById('final-white').textContent = counts.white;

    const title = document.getElementById('winner-title');
    const sub = document.getElementById('winner-subtitle');

    let winningColor = null;
    if (counts.black > counts.white) {
        winningColor = BLACK;
        title.textContent = `Vince ${gameState.blackName}!`;
        sub.textContent = 'Il Nero conquista la scacchiera.';
    } else if (counts.white > counts.black) {
        winningColor = WHITE;
        title.textContent = `Vince ${gameState.whiteName}!`;
        sub.textContent = 'Il Bianco conquista la scacchiera.';
    } else {
        title.textContent = 'Pareggio!';
        sub.textContent = 'Stesso numero di pedine.';
    }

    if (winningColor !== null) {
        const winnerName = (winningColor === BLACK) ? gameState.blackName : gameState.whiteName;
        if (winnerName === gameState.playerName) {
            gameState.winsP1++;
        } else {
            gameState.winsP2++;
        }
    }

    document.getElementById('stat-p1-name').textContent = gameState.playerName;
    document.getElementById('stat-p2-name').textContent = gameState.opponentName;
    document.getElementById('stat-p1-wins').textContent = gameState.winsP1;
    document.getElementById('stat-p2-wins').textContent = gameState.winsP2;

    document.getElementById('gameover-modal').classList.remove('hidden');
}

async function requestRematch() {
    if (gameState.mode === 'multi') {
        if (gameState.roomRef) {
            const snap = await gameState.roomRef.once('value');
            const val = snap.val() || {};
            const hostName = val.host;
            const guestName = val.guest;

            // Inverte i colori rispetto al match precedente in modo casuale o alternato
            const hostIsBlack = Math.random() < 0.5;
            const newBlack = hostIsBlack ? hostName : guestName;
            const newWhite = hostIsBlack ? guestName : hostName;

            await gameState.roomRef.update({
                status: 'playing',
                board: createInitialBoard(),
                currentTurn: BLACK,
                lastMove: null,
                flippedCells: [],
                blackPlayer: newBlack,
                whitePlayer: newWhite,
                winsHost: gameState.winsP1,
                winsGuest: gameState.winsP2,
                rematchTimestamp: Date.now(),
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
        }
    } else {
        const userIsBlack = Math.random() < 0.5;
        gameState.blackName = userIsBlack ? gameState.playerName : gameState.opponentName;
        gameState.whiteName = userIsBlack ? gameState.opponentName : gameState.playerName;
        gameState.myColor = (gameState.blackName === gameState.playerName) ? BLACK : WHITE;

        document.getElementById('gameover-modal').classList.add('hidden');
        openCoinTossModal(gameState.playerName, gameState.opponentName, gameState.blackName);
    }
}

// --- MODALE DI USCITA PERSONALIZZATO ---
function openExitModal() {
    document.getElementById('exit-modal').classList.remove('hidden');
}

function closeExitModal() {
    document.getElementById('exit-modal').classList.add('hidden');
}

async function confirmExit() {
    closeExitModal();
    if (gameState.mode === 'multi' && gameState.roomRef) {
        await gameState.roomRef.update({ status: 'abandoned' });
    }
    resetToLobby();
}

printFullscreen = toggleFullscreen; // compatibilità
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
        document.getElementById('fullscreen-btn').textContent = '⛶ Esci Schermo Intero';
    } else {
        document.exitFullscreen();
        document.getElementById('fullscreen-btn').textContent = '⛶ Schermo Intero';
    }
}

function resetToLobby() {
    if (gameState.roomRef) {
        gameState.roomRef.off();
        gameState.roomRef = null;
    }
    gameState.isProcessing = false;
    document.getElementById('gameover-modal').classList.add('hidden');
    document.getElementById('coin-modal').classList.add('hidden');
    document.getElementById('exit-modal').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('active');
    document.getElementById('waiting-msg').classList.add('hidden');
    validateLobbyInputs();
}