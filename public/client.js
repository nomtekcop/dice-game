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
const casinoRow = document.getElementById('casino-row');
const logArea = document.getElementById('log-area');

let socket = null;
let myId = null;
let myProfile = {
  name: '',
  avatar: null, // dataURL
};

let players = []; // 서버에서 온 플레이어 목록
let currentTurnId = null;

// 간단한 로그 출력
function addLog(text) {
  const p = document.createElement('div');
  p.textContent = text;
  logArea.appendChild(p);
  logArea.scrollTop = logArea.scrollHeight;
}

// 작은 주사위 하나 만들기
function createDie(value, cssClass) {
  const div = document.createElement('div');
  div.className = 'die' + (cssClass ? ' ' + cssClass : '');
  div.textContent = value;
  return div;
}

// 주사위 줄 렌더링 (배열을 받게 해둠. 지금은 1개지만 나중에 여러 개 확장 가능)
function renderDiceRow(container, values, whose) {
  container.innerHTML = '';
  values.forEach((v) => {
    container.appendChild(
      createDie(v, whose === 'mine' ? 'mine' : whose === 'opponent' ? 'opponent' : ''),
    );
  });
}

// 카지노 6개 단순 생성 (지금은 기능 없이 뼈대만)
function setupCasinos() {
  casinoRow.innerHTML = '';
  for (let i = 1; i <= 6; i++) {
    const casino = document.createElement('div');
    casino.className = 'casino';

    const header = document.createElement('div');
    header.className = 'casino-header';

    const die = document.createElement('div');
    die.className = 'casino-die';
    die.textContent = i; // 1~6 고유 번호

    header.appendChild(die);

    const moneyList = document.createElement('div');
    moneyList.className = 'casino-money-list';

    // 일단 샘플로 2~3줄 가짜 배당금 표시 (나중에 서버 연동 가능)
    const sample = [10000, 20000, 30000];
    const count = 2 + ((i + 1) % 2); // 2 또는 3개
    for (let j = 0; j < count; j++) {
      const m = document.createElement('div');
      m.className = 'casino-money';
      m.textContent = sample[j].toLocaleString() + ' $';
      moneyList.appendChild(m);
    }

    casino.appendChild(header);
    casino.appendChild(moneyList);
    casinoRow.appendChild(casino);
  }
}

// 아바타 파일을 dataURL로 읽기
function readAvatarFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

/* ---------------- 프로필 화면 로직 ---------------- */

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

  // 파일 다시 한 번 가져와서 dataURL 없으면 그냥 통과
  if (!myProfile.avatar && avatarInput.files[0]) {
    myProfile.avatar = await readAvatarFile(avatarInput.files[0]);
  }

  // 화면 전환 + 소켓 연결
  profileScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  setupCasinos();
  connectSocket();
});

/* ---------------- 소켓/게임 화면 로직 ---------------- */

function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    addLog('서버에 연결되었습니다.');
  });

  socket.on('awaitProfile', (data) => {
    // 서버가 "프로필 보내줘"라고 할 때 내 프로필 전송
    socket.emit('registerProfile', {
      name: myProfile.name,
      avatar: myProfile.avatar,
    });
  });

  socket.on('roomFull', () => {
    alert('이미 두 명이 모두 입장했어. 방이 꽉 찼어!');
  });

  socket.on('playerInfo', (info) => {
    myId = info.id;
    myNameSpan.textContent = info.name || '나';
    if (info.avatar) {
      myAvatarImg.src = info.avatar;
    }
    myMoneySpan.textContent = (info.money ?? 0) + ' $';
  });

  socket.on('playerList', (list) => {
    players = list;
    const me = list.find((p) => p.id === myId);
    const opp = list.find((p) => p.id !== myId);

    if (opp) {
      opponentNameSpan.textContent = opp.name || '상대 플레이어';
      opponentMoneySpan.textContent = (opp.money ?? 0) + ' $';
      if (opp.avatar) {
        opponentAvatarImg.src = opp.avatar;
      }
    } else {
      opponentNameSpan.textContent = '상대 대기 중…';
      opponentMoneySpan.textContent = '0 $';
      opponentAvatarImg.removeAttribute('src');
    }
  });

  socket.on('turnChanged', ({ currentPlayerId, currentPlayerName }) => {
    currentTurnId = currentPlayerId;
    updateTurnUI(currentPlayerId, currentPlayerName);
  });

  socket.on('diceRolled', (data) => {
    const { rollerId, rollerName, value, nextPlayerId, nextPlayerName } = data;

    const isMine = rollerId === myId;
    addLog(`${rollerName}가 주사위를 굴려서 ${value}가 나왔습니다.`);

    // 중앙 주사위 줄에 표시 (지금은 한 개만, 나중에 여러 개 가능)
    renderDiceRow(
      rolledDiceRow,
      [value],
      isMine ? 'mine' : 'opponent',
    );

    // 내 턴일 때 굴렸으면 내 아래 줄에도 표시해볼까? (지금은 최근 값만)
    if (isMine) {
      renderDiceRow(myDiceRow, [value], 'mine');
    }

    // 턴 넘기기
    currentTurnId = nextPlayerId;
    updateTurnUI(nextPlayerId, nextPlayerName);
  });

  rollBtn.addEventListener('click', () => {
    if (!socket) return;
    socket.emit('rollDice');
  });

  socket.on('notYourTurn', () => {
    addLog('⚠ 아직 네 턴이 아니야!');
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
