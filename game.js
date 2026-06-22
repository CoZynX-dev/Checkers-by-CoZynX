// =============================================
// CHECKERS by CoZynX — Player vs AI  |  Player vs Player
// =============================================

// ── Piece constants ──
const EMPTY       = 0;
const PURPLE      = 1;       // Player 1 (Human / bottom)
const PURPLE_KING = 2;
const RED         = 3;       // Player 2 / AI (top)
const RED_KING    = 4;

// ── Player tokens ──
const P1  = 'purple';   // Player 1 always uses purple pieces
const P2  = 'red';      // Player 2 / AI always uses red pieces

// ── Game state ──
let board         = [];
let currentPlayer = P1;
let selectedPiece = null;
let validMoves    = [];
let moveHistory   = [];
let gameOver      = false;
let aiThinking    = false;
let gameMode      = 'ai';   // 'ai' | 'pvp'

// ==================== MODE TOGGLE ====================

function setMode(mode) {
    if (gameMode === mode) return;
    gameMode = mode;

    // Update button active states
    document.getElementById('btn-mode-ai').classList.toggle('active',  mode === 'ai');
    document.getElementById('btn-mode-pvp').classList.toggle('active', mode === 'pvp');

    // Update score labels
    updateScoreLabels();

    // Restart fresh
    newGame();
}

function updateScoreLabels() {
    document.getElementById('label-purple').textContent = gameMode === 'pvp' ? 'Player 1' : 'You';
    document.getElementById('label-red').textContent    = gameMode === 'pvp' ? 'Player 2' : 'AI';
}

// ==================== SOUND ENGINE ====================

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new AudioCtx();
    return audioCtx;
}

/** Descending pop — piece eliminated */
function playCaptureSound() {
    try {
        const ctx  = getAudioCtx();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.22);
    } catch (_) {}
}

/** Rising C-E-G arpeggio — king promotion */
function playKingSound() {
    try {
        const ctx   = getAudioCtx();
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, i) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            const t = ctx.currentTime + i * 0.1;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.28, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            osc.start(t);
            osc.stop(t + 0.45);
        });
    } catch (_) {}
}

// ==================== INIT ====================

function initBoard() {
    board = [];
    for (let r = 0; r < 8; r++) {
        board[r] = [];
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) {
                if (r < 3)      board[r][c] = RED;    // top
                else if (r > 4) board[r][c] = PURPLE; // bottom
                else            board[r][c] = EMPTY;
            } else {
                board[r][c] = EMPTY;
            }
        }
    }
}

function newGame() {
    initBoard();
    currentPlayer = P1;
    selectedPiece = null;
    validMoves    = [];
    moveHistory   = [];
    gameOver      = false;
    aiThinking    = false;
    updateScoreLabels();
    renderBoard();
    updateStatus();
    showMessage('');
}

// ==================== RENDERING ====================

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.row = r;
            cell.dataset.col = c;

            // Highlight valid move targets
            const moveIndex = validMoves.findIndex(m => m.row === r && m.col === c);
            if (moveIndex !== -1) {
                cell.classList.add('highlight', 'move-target');
                cell.addEventListener('click', () => executeMove(validMoves[moveIndex]));
            }

            const piece = board[r][c];
            if (piece !== EMPTY) {
                const pieceEl  = document.createElement('div');
                const isPurple = piece === PURPLE || piece === PURPLE_KING;
                const isKing   = piece === PURPLE_KING || piece === RED_KING;
                const owner    = isPurple ? P1 : P2;

                pieceEl.className = 'piece ' + (isPurple ? 'purple' : 'red');
                if (isKing) pieceEl.classList.add('king');

                // Mark selected
                if (selectedPiece && selectedPiece.row === r && selectedPiece.col === c) {
                    pieceEl.classList.add('selected');
                }

                // Determine if this piece is interactive this turn
                const isMyTurn   = owner === currentPlayer;
                const canControl = isMyTurn && !gameOver && !aiThinking &&
                                   (gameMode === 'pvp' || currentPlayer === P1);

                if (canControl) {
                    pieceEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectPiece(r, c);
                    });
                    pieceEl.style.cursor = 'pointer';
                } else {
                    pieceEl.style.cursor = 'default';
                }

                cell.appendChild(pieceEl);
            }

            boardEl.appendChild(cell);
        }
    }
}

function updateStatus() {
    const turnText = document.getElementById('turn-text');
    const turnDot  = document.getElementById('turn-dot');

    if (gameOver) {
        turnText.textContent = 'Game Over';
        return;
    }

    if (currentPlayer === P1) {
        turnText.textContent = gameMode === 'pvp' ? 'Player 1\'s Turn' : 'Your Turn';
        turnDot.className    = '';                    // purple dot (default)
    } else {
        if (gameMode === 'pvp') {
            turnText.textContent = 'Player 2\'s Turn';
        } else {
            turnText.textContent = aiThinking ? 'AI Thinking…' : 'AI\'s Turn';
        }
        turnDot.className = 'red';
    }

    // Update piece counts
    let p1Count = 0, p2Count = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === PURPLE || board[r][c] === PURPLE_KING) p1Count++;
            if (board[r][c] === RED    || board[r][c] === RED_KING)    p2Count++;
        }
    }
    document.getElementById('score-purple').textContent = p1Count;
    document.getElementById('score-red').textContent    = p2Count;
}

function showMessage(msg) {
    document.getElementById('message-box').textContent = msg;
}

// ── Win label helpers ──
function winnerLabel(player) {
    if (gameMode === 'pvp') {
        return player === P1 ? 'Player 1' : 'Player 2';
    }
    return player === P1 ? 'You' : 'AI';
}

// ==================== PIECE HELPERS ====================

function isOwnPiece(piece, player) {
    if (player === P1) return piece === PURPLE || piece === PURPLE_KING;
    return piece === RED || piece === RED_KING;
}

function isOpponentPiece(piece, player) {
    if (player === P1) return piece === RED || piece === RED_KING;
    return piece === PURPLE || piece === PURPLE_KING;
}

function getDirections(piece) {
    if (piece === PURPLE)                              return [[-1,-1],[-1, 1]];
    if (piece === RED)                                 return [[ 1,-1],[ 1, 1]];
    if (piece === PURPLE_KING || piece === RED_KING)   return [[-1,-1],[-1,1],[1,-1],[1,1]];
    return [];
}

// ==================== MOVE GENERATION ====================

function getSimpleMoves(r, c, boardState) {
    const piece = boardState[r][c];
    const moves = [];
    for (const [dr, dc] of getDirections(piece)) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && boardState[nr][nc] === EMPTY) {
            moves.push({ row: nr, col: nc, captures: [], path: [{ row: r, col: c }] });
        }
    }
    return moves;
}

function getJumpMoves(r, c, boardState, player, visited = null) {
    const piece = boardState[r][c];
    const moves = [];
    if (!visited) visited = new Set();
    visited.add(`${r},${c}`);

    for (const [dr, dc] of getDirections(piece)) {
        const mr = r + dr, mc = c + dc;
        const lr = r + 2 * dr, lc = c + 2 * dc;

        if (lr >= 0 && lr < 8 && lc >= 0 && lc < 8 &&
            isOpponentPiece(boardState[mr][mc], player) &&
            boardState[lr][lc] === EMPTY &&
            !visited.has(`${mr},${mc}`)) {

            const capturedPiece = boardState[mr][mc];
            boardState[mr][mc] = EMPTY;
            boardState[lr][lc] = piece;
            boardState[r][c]   = EMPTY;

            let promotedPiece = piece;
            if ((player === P1 && lr === 0 && piece === PURPLE) ||
                (player === P2 && lr === 7 && piece === RED)) {
                promotedPiece = (player === P1) ? PURPLE_KING : RED_KING;
                boardState[lr][lc] = promotedPiece;
            }

            const capVisited = new Set(visited);
            capVisited.add(`${mr},${mc}`);

            let furtherJumps = [];
            if (promotedPiece === piece) {
                furtherJumps = getJumpMoves(lr, lc, boardState, player, capVisited);
            }

            if (furtherJumps.length > 0) {
                for (const fj of furtherJumps) {
                    moves.push({
                        row: fj.row, col: fj.col,
                        captures: [{ row: mr, col: mc }, ...fj.captures],
                        path:     [{ row: r,  col: c  }, ...fj.path]
                    });
                }
            } else {
                moves.push({ row: lr, col: lc, captures: [{ row: mr, col: mc }], path: [{ row: r, col: c }] });
            }

            // Restore
            boardState[r][c]   = piece;
            boardState[mr][mc] = capturedPiece;
            boardState[lr][lc] = EMPTY;
        }
    }
    return moves;
}

function getAllMoves(player, boardState) {
    let allJumps = [], allSimple = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (!isOwnPiece(boardState[r][c], player)) continue;
            const jumps = getJumpMoves(r, c, boardState, player);
            if (jumps.length > 0) {
                jumps.forEach(j => { j.fromRow = r; j.fromCol = c; });
                allJumps.push(...jumps);
            }
            const simple = getSimpleMoves(r, c, boardState);
            simple.forEach(s => { s.fromRow = r; s.fromCol = c; });
            allSimple.push(...simple);
        }
    }
    return allJumps.length > 0 ? allJumps : allSimple;
}

function getMovesForPiece(r, c, player, boardState) {
    const allMoves = getAllMoves(player, boardState);
    const hasJumps = allMoves.some(m => m.captures.length > 0);
    const pieceMoves = allMoves.filter(m => m.fromRow === r && m.fromCol === c);
    return hasJumps ? pieceMoves.filter(m => m.captures.length > 0) : pieceMoves;
}

// ==================== HUMAN / PvP INTERACTION ====================

function selectPiece(r, c) {
    // Block if AI is computing or game is over
    if (gameOver || aiThinking) return;
    // In AI mode, only P1 can interact
    if (gameMode === 'ai' && currentPlayer !== P1) return;

    const piece = board[r][c];
    if (!isOwnPiece(piece, currentPlayer)) return;

    const moves    = getMovesForPiece(r, c, currentPlayer, board);
    const allMoves = getAllMoves(currentPlayer, board);
    const hasJumps = allMoves.some(m => m.captures.length > 0);

    if (hasJumps && moves.length === 0) {
        const who = gameMode === 'pvp'
            ? (currentPlayer === P1 ? 'Player 1' : 'Player 2')
            : 'You';
        showMessage(`${who} must capture! Select a piece that can jump.`);
        return;
    }

    selectedPiece = { row: r, col: c };
    validMoves    = moves;
    renderBoard();
    showMessage(moves.length === 0 ? 'No valid moves for this piece.' : '');
}

function executeMove(move) {
    if (gameOver || aiThinking) return;

    const fromRow = selectedPiece.row;
    const fromCol = selectedPiece.col;
    const piece   = board[fromRow][fromCol];

    moveHistory.push(JSON.parse(JSON.stringify(board)));

    board[fromRow][fromCol] = EMPTY;

    const hadCaptures = move.captures.length > 0;
    for (const cap of move.captures) board[cap.row][cap.col] = EMPTY;
    if (hadCaptures) playCaptureSound();

    // Promotion check
    let finalPiece = piece;
    let promoted   = false;
    if (piece === PURPLE && move.row === 0) { finalPiece = PURPLE_KING; promoted = true; }
    if (piece === RED    && move.row === 7) { finalPiece = RED_KING;    promoted = true; }
    board[move.row][move.col] = finalPiece;

    selectedPiece = null;
    validMoves    = [];

    if (promoted) {
        playKingSound();
        requestAnimationFrame(() => {
            renderBoard();
            flashKing(move.row, move.col);
        });
    }

    if (checkWin()) return;
    switchTurn();
}

function flashKing(row, col) {
    const cells   = document.querySelectorAll('.cell');
    const pieceEl = cells[row * 8 + col]?.querySelector('.piece');
    if (pieceEl) {
        pieceEl.classList.add('king-promoted');
        setTimeout(() => pieceEl.classList.remove('king-promoted'), 700);
    }
}

// ==================== TURN MANAGEMENT ====================

function switchTurn() {
    currentPlayer = (currentPlayer === P1) ? P2 : P1;
    updateStatus();
    renderBoard();

    if (currentPlayer === P2 && !gameOver) {
        if (gameMode === 'ai') {
            // AI handles P2
            aiThinking = true;
            updateStatus();
            setTimeout(() => {
                aiMove();
                aiThinking = false;

                if (!gameOver) {
                    currentPlayer = P1;
                    updateStatus();
                    renderBoard();
                    checkNoMoves(P1);
                }
            }, 420);
        } else {
            // PvP — just wait for Player 2 input
            checkNoMoves(P2);
        }
    } else if (currentPlayer === P1 && !gameOver) {
        if (gameMode === 'pvp') checkNoMoves(P1);
    }
}

function checkNoMoves(player) {
    if (getAllMoves(player, board).length === 0) {
        gameOver = true;
        const loser  = player;
        const winner = loser === P1 ? P2 : P1;
        const wLabel = winnerLabel(winner);
        const lLabel = winnerLabel(loser);
        showMessage(`${lLabel} has no moves — ${wLabel} wins! 🎉`);
        updateStatus();
    }
}

function checkWin() {
    let p1Count = 0, p2Count = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === PURPLE || board[r][c] === PURPLE_KING) p1Count++;
            if (board[r][c] === RED    || board[r][c] === RED_KING)    p2Count++;
        }
    }
    if (p1Count === 0) {
        gameOver = true;
        showMessage(`All ${winnerLabel(P1)} pieces captured — ${winnerLabel(P2)} wins!`);
        updateStatus(); renderBoard(); return true;
    }
    if (p2Count === 0) {
        gameOver = true;
        showMessage(`All ${winnerLabel(P2)} pieces captured — ${winnerLabel(P1)} wins! 🎉`);
        updateStatus(); renderBoard(); return true;
    }
    return false;
}

function undoMove() {
    if (moveHistory.length === 0 || aiThinking) return;

    if (gameMode === 'ai') {
        // Undo both human + AI turns if possible
        if (currentPlayer === P1 && moveHistory.length >= 2) {
            moveHistory.pop();
            board = moveHistory.pop();
        } else if (moveHistory.length >= 1) {
            board = moveHistory.pop();
        }
        currentPlayer = P1;
    } else {
        // PvP: undo one turn at a time
        if (moveHistory.length >= 1) board = moveHistory.pop();
        currentPlayer = currentPlayer === P1 ? P2 : P1;
    }

    selectedPiece = null;
    validMoves    = [];
    gameOver      = false;
    renderBoard();
    updateStatus();
    showMessage('Move undone.');
}

// ==================== AI (Minimax + Alpha-Beta) ====================

function aiMove() {
    const moves = getAllMoves(P2, board);

    if (moves.length === 0) {
        gameOver = true;
        showMessage(`AI has no moves — ${winnerLabel(P1)} wins! 🎉`);
        updateStatus(); renderBoard(); return;
    }

    let bestScore = -Infinity, bestMove = null;

    for (const move of moves) {
        const saved = JSON.parse(JSON.stringify(board));
        applyMove(move, P2, board);
        const score = minimax(board, 4, -Infinity, Infinity, false);
        board = JSON.parse(JSON.stringify(saved));
        if (score > bestScore) { bestScore = score; bestMove = move; }
    }

    if (bestMove) {
        moveHistory.push(JSON.parse(JSON.stringify(board)));
        const pieceBefore = board[bestMove.fromRow][bestMove.fromCol];
        const hadCaptures = bestMove.captures.length > 0;

        applyMove(bestMove, P2, board);

        if (hadCaptures) playCaptureSound();

        const pieceAfter = board[bestMove.row][bestMove.col];
        if (pieceBefore === RED && pieceAfter === RED_KING) {
            playKingSound();
            requestAnimationFrame(() => {
                renderBoard();
                flashKing(bestMove.row, bestMove.col);
            });
        }

        checkWin();
    }
}

function applyMove(move, player, boardState) {
    const piece = boardState[move.fromRow][move.fromCol];
    boardState[move.fromRow][move.fromCol] = EMPTY;
    for (const cap of move.captures) boardState[cap.row][cap.col] = EMPTY;
    let finalPiece = piece;
    if (piece === PURPLE && move.row === 0) finalPiece = PURPLE_KING;
    if (piece === RED    && move.row === 7) finalPiece = RED_KING;
    boardState[move.row][move.col] = finalPiece;
}

function minimax(boardState, depth, alpha, beta, isMaximizing) {
    if (depth === 0) return evaluateBoard(boardState);
    const player = isMaximizing ? P2 : P1;
    const moves  = getAllMoves(player, boardState);
    if (moves.length === 0) return isMaximizing ? -1000 : 1000;

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const saved = JSON.parse(JSON.stringify(boardState));
            applyMove(move, player, boardState);
            const e = minimax(boardState, depth - 1, alpha, beta, false);
            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) boardState[r][c] = saved[r][c];
            maxEval = Math.max(maxEval, e);
            alpha   = Math.max(alpha, e);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const saved = JSON.parse(JSON.stringify(boardState));
            applyMove(move, player, boardState);
            const e = minimax(boardState, depth - 1, alpha, beta, true);
            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) boardState[r][c] = saved[r][c];
            minEval = Math.min(minEval, e);
            beta    = Math.min(beta, e);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function evaluateBoard(boardState) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = boardState[r][c];
            if      (p === RED)         { score += 5;  score += r; }
            else if (p === RED_KING)    { score += 10; score += (3.5 - Math.abs(3.5 - r)) * 0.5; score += (3.5 - Math.abs(3.5 - c)) * 0.5; }
            else if (p === PURPLE)      { score -= 5;  score -= (7 - r); }
            else if (p === PURPLE_KING) { score -= 10; score -= (3.5 - Math.abs(3.5 - r)) * 0.5; score -= (3.5 - Math.abs(3.5 - c)) * 0.5; }
        }
    }
    return score;
}

// ==================== START ====================

newGame();
