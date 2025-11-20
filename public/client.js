// client.js

// DOM 요소들
const profileScreen = document.getElementById('profile-screen');
const gameScreen = document.getElementById('game-screen');

const nicknameInput = document.getElementById('nickname-input');
const avatarDrop = document.getElementById('avatar-drop');
const avatarInput = document.getElementById('avatar-input');
const avatarDropText = document.getElementById('avatar-drop-text');
const enterGameBtn = document.getElementById('enter-game-btn');

const roundNumberSpan = document.getElementById('round-number');
const opponentNameSpan = document.getElementById('opponent-name');
const opponentMoneySpan = document.getElementById('opponent-money');
const opponentAvatarImg = document.getElementById('opponent-avatar');

const myNameSpan = document.getElementById('my-name');
const myMoneySpan = document.getElementById('my-money');
const myAvatarImg = document.getElementById('my-avatar');

const turnIndicator = document.getElementById('turn-indicator');
const rolledDiceRow = document.getElementById('rolled-dice-row');
const myDiceRow = document.getElementById('my-dice-row');
const rollBtn = document.getElementById('roll-btn');
const startGameBtn = document.getElementById('start-game-btn');
const choiceRow = document.getElementById('choice-row');
const casinoRow = document.getElementById('casino-row');
const logArea = document.getElementById('log-area');

let socket = null;
let myId = null;
let myProfile = {
  name: '',
  avatar: null,
};
let players = [];
let currentTurnId = null;
let isHost = false;
let gameStarted = false;

// 로그 출력
function addLog(text) {
  const p = document.createElement('div');
  p.textContent = text;
  logArea.appendChild(p);
  logArea.scrollTop = logArea.scrollHeight;
}

// 주사위 DOM
function createDie(value, cssClass) {
  const div = document.createElement('div');
  div.className = 'die' + (cssClass ? ' ' + cssClass : '');
  div.textContent = value;
  return div;
}

function renderDiceRow(container, dice, whose) {
  container.innerHTML = '';
  dice.forEach((d) => {
    let cls = '';
    if (d.type === 'neutral') cls = 'neutral';
    if (whose === 'mine') cls += (cls ? ' ' : '') + 'mine';
    else if (whose === 'opponent') cls += (cls ? ' ' : '') + 'opponent';
    container.appendChild(createDie(d.value, cls));
  });
}

// 카지노 6개 기본 뼈대 생성
function setupCasinosEmpty() {
  casinoRow.innerHTML = '';
  for (let i = 1; i <= 6; i++) {
    const casino = document.createElement('div');
    casino.className = 'casino';

    const header = document.createElement('div');
    header.className = 'casino-header';

    const die = document.createElement('div');
    die.className = 'casino-die';
    die.textContent = i;

    header.appendChild(die);

    const moneyList = document.createElement('div');
    moneyList.className = 'casino-money-list';
    moneyList.id = `casino-money-${i}`;

    casino.appendChild(header);
    casino.appendChild(moneyList);
    casinoRow.appendChild(casino);
  }
}

// 라운드 시작 시 돈 배치 애니메이션
function animateRoundSetup(payload) {
  const { round, casinos } = payload;
  roundNumberSpan.textContent = String(round);

  setupCasinosEmpty();

  let delay = 0;
  const stepDelay = 400; // 0.4초마다 한 장씩

  casinos.forEach((c) => {
    const moneyList = document.getElementById(`casino-money-${c.index}`);
    if (!moneyList) return;
    let sum = 0;
    c.banknotes.forEach((note) => {
      setTimeout(() => {
        const div = document.createElement('div');
        div.className = 'casino-money';
        div.textContent = note.toLocaleString() + ' $';
        moneyList.appendChild(div);
      }, delay);
      sum += note;
      delay += stepDelay;
    });
  });
}

// 아바타 dataURL 읽기
function readAvatarFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

/* ---------- 프로필 화면 ---------- */

avatarDrop.addEventListener('click', () => {
  avatarInput.click();
});

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files[0];
  if (!file) return;
  const dataUrl = await readAvatarFile(file);
  if (!dataUrl) return;
  myProfile.avatar = dataUrl;
  avatarDropText.style.display = 'none';

  avatarDrop.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl;
  avatarDrop.appendChild(img);
});

enterGameBtn.addEventListener('click', async () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    alert('닉네임을 입력해줘!');
    return;
  }
  myProfile.name = nickname;

  if (!myProfile.avatar && avatarInput.files[0]) {
    myProfile.avatar = await readAvatarFile(avatarInput.files[0]);
  }

  profileScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  setupCasinosEmpty();
  connectSocket();
});

/* ---------- 소켓 & 게임 화면 ---------- */

function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    addLog('서버에 연결되었습니다.');
  });

  socket.on('awaitProfile', () => {
    // 서버가 프로필 요청하면 내 프로필 전송
    socket.emit('registerProfile', {
      name: myProfile.name,
      avatar: myProfile.avatar,
    });
  });

  socket.on('roomFull', () => {
    alert('이미 두 명이 입장해서 방이 꽉 찼어!');
  });

  socket.on('playerInfo', (info) => {
    myId = info.id;
    myNameSpan.textContent = info.name || '나';
    myMoneySpan.textContent = (info.money ?? 0) + ' $';
    if (info.avatar) myAvatarImg.src = info.avatar;
  });

  socket.on('playerList', (list) => {
    players = list;
    const me = list.find((p) => p.id === myId);
    const opp = list.find((p) => p.id !== myId);

    if (me) {
      isHost = me.index === 1;
      if (isHost && !gameStarted && list.length === 2) {
        startGameBtn.disabled = false;
      }
    }

    if (opp) {
      opponentNameSpan.textContent = opp.name || '상대 플레이어';
      opponentMoneySpan.textContent = (opp.money ?? 0) + ' $';
      if (opp.avatar) opponentAvatarImg.src = opp.avatar;
    } else {
      opponentNameSpan.textContent = '상대 대기 중…';
      opponentMoneySpan.textContent = '0 $';
      opponentAvatarImg.removeAttribute('src');
    }
  });

  socket.on('readyToStart', ({ hostId }) => {
    if (myId === hostId) {
      startGameBtn.disabled = false;
      addLog('두 명 모두 입장! 선 플레이어가 [게임 시작]을 눌러주세요.');
    } else {
      addLog('두 명 모두 입장! 선 플레이어가 게임을 시작할 때까지 기다려주세요.');
    }
  });

  socket.on('gameStarted', ({ round }) => {
    gameStarted = true;
    startGameBtn.disabled = true;
    roundNumberSpan.textContent = String(round);
    addLog(`게임 시작! ROUND ${round}`);
  });

  socket.on('roundSetup', (payload) => {
    animateRoundSetup(payload);
  });

  socket.on('turnChanged', ({ currentPlayerId, currentPlayerName }) => {
    currentTurnId = currentPlayerId;
    updateTurnUI(currentPlayerId, currentPlayerName);
  });

  socket.on('gameState', (state) => {
    // 돈/주사위 남은 개수 갱신용
    state.players.forEach((p) => {
      if (p.id === myId) {
        myMoneySpan.textContent = (p.money ?? 0) + ' $';
      } else {
        opponentMoneySpan.textContent = (p.money ?? 0) + ' $';
      }
    });
  });

  socket.on('diceRolled', ({ rollerId, rollerName, dice }) => {
    const isMine = rollerId === myId;
    addLog(`${rollerName}가 주사위를 굴렸습니다. (${dice.length}개)`);

    const whose = isMine ? 'mine' : 'opponent';
    renderDiceRow(rolledDiceRow, dice, whose);

    choiceRow.innerHTML = '';

    if (isMine) {
      // 내가 굴렸다면 선택 가능한 숫자 버튼 만들기
      const values = [...new Set(dice.map((d) => d.value))].sort();
      values.forEach((v) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = `${v}번 카지노에 배팅`;
        btn.addEventListener('click', () => {
          socket.emit('chooseBetValue', v);
          choiceRow.innerHTML = '';
          rollBtn.disabled = true;
        });
        choiceRow.appendChild(btn);
      });
    }
  });

  socket.on('betPlaced', ({ playerId, playerName, casinoIndex, colorCount, neutralCount }) => {
    const owner = playerId === myId ? '나' : playerName;
    addLog(
      `${owner}가 ${casinoIndex}번 카지노에 색 주사위 ${colorCount}개, 중립 ${neutralCount}개를 배팅했습니다.`,
    );
    rolledDiceRow.innerHTML = '';
    if (playerId === myId) {
      myDiceRow.innerHTML = ''; // 나중에 원하면 누적 표시 가능
    }
  });

  socket.on('payouts', (payouts) => {
    payouts.forEach((p) => {
      addLog(
        `${p.casinoIndex}번 카지노: ${p.playerName} 이(가) ${p.amount.toLocaleString()} $ 획득!`,
      );
    });
  });

  socket.on('gameOver', ({ players, winnerId, winnerName }) => {
    gameStarted = false;
    let msg = '게임 종료!\n';
    players.forEach((p) => {
      msg += `${p.name}: ${p.money.toLocaleString()} $\n`;
    });
    if (winnerId) {
      msg += `우승: ${winnerName}`;
    }
    alert(msg);
  });

  socket.on('notYourTurn', () => {
    addLog('⚠ 아직 네 턴이 아니야!');
  });

  socket.on('rollRejected', () => {
    addLog('이미 굴린 주사위를 먼저 배팅해야 해!');
  });

  socket.on('noDiceLeft', () => {
    addLog('더 이상 굴릴 주사위가 없어. 이번 라운드에 할 수 있는 건 끝!');
  });

  startGameBtn.addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('startGame');
    startGameBtn.disabled = true;
  });

  rollBtn.addEventListener('click', () => {
    if (!socket) return;
    socket.emit('rollDice');
  });
}

function updateTurnUI(currentPlayerId, currentPlayerName) {
  const isMyTurn = myId && currentPlayerId === myId;
  if (isMyTurn) {
    turnIndicator.textContent = '내 차례';
    rollBtn.disabled = false;
  } else if (currentPlayerName) {
    turnIndicator.textContent = `${currentPlayerName}의 차례`;
    rollBtn.disabled = true;
  } else {
    turnIndicator.textContent = '대기 중…';
    rollBtn.disabled = true;
  }
}
