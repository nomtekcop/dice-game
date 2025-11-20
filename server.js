// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// ===== 게임 상수 =====
const MAX_ROUNDS = 4;
const BANKNOTE_VALUES = [
  10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000,
];

// ===== 전역 상태 =====
let players = []; // { id, name, avatar, index, money, diceColorLeft, diceNeutralLeft, pendingRoll }
let deck = []; // 남은 지폐
let casinos = []; // 길이 6, { banknotes: [값...], diceByPlayer: {id:개수}, neutralCount }
let currentRound = 0;
let currentTurn = null;
let gameStarted = false;

// ===== 유틸 =====
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function createDeck() {
  const d = [];
  for (const v of BANKNOTE_VALUES) {
    for (let i = 0; i < 6; i++) {
      d.push(v);
    }
  }
  shuffle(d);
  return d;
}

function resetPlayersForNewRound() {
  players.forEach((p) => {
    p.diceColorLeft = 8;
    p.diceNeutralLeft = 4;
    p.pendingRoll = null;
  });
}

function setupCasinosForRound() {
  casinos = [];
  for (let i = 0; i < 6; i++) {
    let sum = 0;
    const notes = [];
    while (sum < 50000 && deck.length > 0) {
      const note = deck.pop(); // 덱에서 한 장 뽑아서
      notes.push(note);
      sum += note;
    }
    casinos.push({
      banknotes: notes,
      diceByPlayer: {}, // {playerId: count}
      neutralCount: 0,
    });
  }

  // 라운드 세팅 정보 전달 (애니메이션용)
  io.emit('roundSetup', {
    round: currentRound,
    casinos: casinos.map((c, idx) => ({
      index: idx + 1,
      banknotes: c.banknotes,
    })),
  });
}

function getPlayersView() {
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    color: p.color,
    index: p.index,
    money: p.money,
    diceColorLeft: p.diceColorLeft ?? 0,
    diceNeutralLeft: p.diceNeutralLeft ?? 0,
  }));
}

function broadcastPlayerList() {
  io.emit('playerList', getPlayersView());
}

function broadcastGameStateBasic() {
  io.emit('gameState', {
    round: currentRound,
    casinos: casinos.map((c, idx) => ({
      index: idx + 1,
      diceByPlayer: c.diceByPlayer,
      neutralCount: c.neutralCount,
    })),
    players: getPlayersView(),
    currentTurnId: currentTurn,
  });
}

function playerHasDice(p) {
  return (p.diceColorLeft ?? 0) + (p.diceNeutralLeft ?? 0) > 0;
}

// ===== 턴 & 라운드 관리 =====
function advanceTurnOrEndRound() {
  const playersWithDice = players.filter(playerHasDice);
  if (playersWithDice.length === 0) {
    endRound();
    return;
  }

  const curIndex = players.findIndex((p) => p.id === currentTurn);
  for (let offset = 1; offset <= players.length; offset++) {
    const candidate = players[(curIndex + offset) % players.length];
    if (playerHasDice(candidate)) {
      currentTurn = candidate.id;
      io.emit('turnChanged', {
        currentPlayerId: currentTurn,
        currentPlayerName: candidate.name,
      });
      return;
    }
  }

  // 혹시 못 찾으면 라운드 종료
  endRound();
}

function endRound() {
  console.log(`라운드 ${currentRound} 종료, 정산 시작`);

  // 카지노별 정산
  for (let i = 0; i < casinos.length; i++) {
    const casino = casinos[i];
    const counts = [];
    // 플레이어별
    for (const p of players) {
      const cnt = casino.diceByPlayer[p.id] || 0;
      if (cnt > 0) {
        counts.push({ id: p.id, type: 'player', count: cnt });
      }
    }
    // 중립
    if (casino.neutralCount > 0) {
      counts.push({ id: 'neutral', type: 'neutral', count: casino.neutralCount });
    }

    if (counts.length === 0) continue;

    // 동률 OUT 처리
    const byCount = {};
    for (const item of counts) {
      if (!byCount[item.count]) byCount[item.count] = [];
      byCount[item.count].push(item);
    }

    const remaining = [];
    for (const cStr of Object.keys(byCount)) {
      const list = byCount[cStr];
      if (list.length === 1) {
        remaining.push(list[0]);
      }
    }

    if (remaining.length === 0) continue;

    // 많이 낸 순으로 정렬
    remaining.sort((a, b) => b.count - a.count);

    // 큰 지폐부터 나눠주기
    const notesDesc = [...casino.banknotes].sort((a, b) => b - a);
    const payouts = [];
    for (let k = 0; k < notesDesc.length && k < remaining.length; k++) {
      const target = remaining[k];
      const money = notesDesc[k];
      if (target.type === 'player') {
        const pl = players.find((p) => p.id === target.id);
        if (pl) {
          pl.money += money;
          payouts.push({
            casinoIndex: i + 1,
            playerName: pl.name,
            amount: money,
          });
        }
      } else {
        // 중립이 가져가면 그냥 사라짐
        payouts.push({
          casinoIndex: i + 1,
          playerName: '중립',
          amount: money,
        });
      }
    }

    if (payouts.length > 0) {
      io.emit('payouts', payouts);
    }
  }

  // 다음 라운드 또는 게임 종료
  if (currentRound >= MAX_ROUNDS || deck.length === 0) {
    // 게임 종료
    let winner = null;
    for (const p of players) {
      if (!winner || p.money > winner.money) winner = p;
    }
    io.emit('gameOver', {
      players: getPlayersView(),
      winnerId: winner ? winner.id : null,
      winnerName: winner ? winner.name : null,
    });
    gameStarted = false;
    currentRound = 0;
    currentTurn = null;
    casinos = [];
    deck = [];
    players.forEach((p) => {
      p.diceColorLeft = 0;
      p.diceNeutralLeft = 0;
      p.pendingRoll = null;
    });
    broadcastGameStateBasic();
  } else {
    currentRound += 1;
    resetPlayersForNewRound();
    setupCasinosForRound();
    // 턴은 다시 1번 플레이어부터
    if (players.length > 0) {
      currentTurn = players[0].id;
      io.emit('turnChanged', {
        currentPlayerId: currentTurn,
        currentPlayerName: players[0].name,
      });
    }
    broadcastGameStateBasic();
  }
}

// ===== 소켓 처리 =====
io.on('connection', (socket) => {
  console.log('새 유저 접속:', socket.id);

  if (players.length >= 2) {
    socket.emit('roomFull');
    return;
  }

  const playerIndex = players.length + 1;
  const player = {
    id: socket.id,
    name: null,
    avatar: null,
    color: null,
    index: playerIndex,
    money: 0,
    diceColorLeft: 0,
    diceNeutralLeft: 0,
    pendingRoll: null,
  };
  players.push(player);

  socket.emit('awaitProfile', {
    suggestedName: `Player ${playerIndex}`,
  });

  // 프로필 등록
  socket.on('registerProfile', (data) => {
    const nameFromClient = data?.name ?? '';
    player.name = String(nameFromClient).trim() || `Player ${playerIndex}`;
    player.avatar = data?.avatar || null;
    player.color = data?.color || null;

    socket.emit('playerInfo', {
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      index: player.index,
      money: player.money,
    });

    broadcastPlayerList();

    // 아직 게임이 시작 안 됐고, 둘 다 들어와 있다면
    if (players.length === 2 && !gameStarted) {
      io.emit('readyToStart', {
        hostId: players[0].id,
      });
    }
  });

  // 게임 시작 (선플레이어만 가능)
  socket.on('startGame', () => {
    if (gameStarted) return;
    if (players.length < 2) return;
    if (socket.id !== players[0].id) return; // 1번만 시작 가능

    gameStarted = true;
    currentRound = 1;
    deck = createDeck();
    resetPlayersForNewRound();
    setupCasinosForRound();

    currentTurn = players[0].id;
    io.emit('gameStarted', {
      round: currentRound,
    });
    io.emit('turnChanged', {
      currentPlayerId: currentTurn,
      currentPlayerName: players[0].name,
    });
    broadcastGameStateBasic();
  });

  // 주사위 굴리기 (남은 주사위 전부)
  socket.on('rollDice', () => {
    if (!gameStarted) return;
    if (socket.id !== currentTurn) {
      socket.emit('notYourTurn');
      return;
    }

    const p = players.find((pl) => pl.id === socket.id);
    if (!p) return;

    if (p.pendingRoll) {
      socket.emit('rollRejected', 'alreadyRolled');
      return;
    }

    const totalDice = (p.diceColorLeft ?? 0) + (p.diceNeutralLeft ?? 0);
    if (totalDice <= 0) {
      socket.emit('noDiceLeft');
      return;
    }

    const dice = [];
    for (let i = 0; i < p.diceColorLeft; i++) {
      dice.push({
        value: Math.floor(Math.random() * 6) + 1,
        type: 'color',
      });
    }
    for (let i = 0; i < p.diceNeutralLeft; i++) {
      dice.push({
        value: Math.floor(Math.random() * 6) + 1,
        type: 'neutral',
      });
    }

    p.pendingRoll = dice;

    io.emit('diceRolled', {
      rollerId: p.id,
      rollerName: p.name,
      dice,
    });
  });

  // 어떤 숫자(=카지노)에 베팅할지 선택
  socket.on('chooseBetValue', (value) => {
    if (!gameStarted) return;
    if (socket.id !== currentTurn) return;

    const v = Number(value);
    if (!(v >= 1 && v <= 6)) return;

    const p = players.find((pl) => pl.id === socket.id);
    if (!p || !p.pendingRoll) return;

    const dice = p.pendingRoll;
    const selected = dice.filter((d) => d.value === v);
    if (selected.length === 0) return;

    let colorCount = 0;
    let neutralCount = 0;
    for (const d of selected) {
      if (d.type === 'color') colorCount++;
      else if (d.type === 'neutral') neutralCount++;
    }

    p.diceColorLeft -= colorCount;
    p.diceNeutralLeft -= neutralCount;
    if (p.diceColorLeft < 0) p.diceColorLeft = 0;
    if (p.diceNeutralLeft < 0) p.diceNeutralLeft = 0;
    p.pendingRoll = null;

    const casino = casinos[v - 1];
    if (!casino.diceByPlayer[p.id]) casino.diceByPlayer[p.id] = 0;
    casino.diceByPlayer[p.id] += colorCount;
    casino.neutralCount += neutralCount;

    io.emit('betPlaced', {
      playerId: p.id,
      playerName: p.name,
      casinoIndex: v,
      colorCount,
      neutralCount,
    });

    broadcastGameStateBasic();

    // 다음 턴 또는 라운드 종료
    advanceTurnOrEndRound();
  });

  socket.on('disconnect', () => {
    console.log('유저 나감:', socket.id);
    const wasTurn = socket.id === currentTurn;

    players = players.filter((p) => p.id !== socket.id);

    if (players.length < 2) {
      gameStarted = false;
      currentRound = 0;
      currentTurn = null;
      casinos = [];
      deck = [];
    }

    if (wasTurn && players.length > 0) {
      currentTurn = players[0].id;
      io.emit('turnChanged', {
        currentPlayerId: currentTurn,
        currentPlayerName: players[0].name,
      });
    }

    broadcastPlayerList();
    broadcastGameStateBasic();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
