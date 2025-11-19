const socket = io();

const myInfoP = document.getElementById('myInfo');
const turnInfoP = document.getElementById('turnInfo');
const lastRollP = document.getElementById('lastRoll');
const playerListDiv = document.getElementById('playerList');
const logDiv = document.getElementById('log');
const rollBtn = document.getElementById('rollBtn');

let myId = null;
let myName = null;
let currentTurnId = null;

// 로그에 한 줄 추가하는 함수
function addLog(text) {
  const p = document.createElement('p');
  p.textContent = text;
  logDiv.appendChild(p);
  logDiv.scrollTop = logDiv.scrollHeight;
}

// 내 플레이어 정보 받기
socket.on('playerInfo', (data) => {
  myId = data.id;
  myName = data.name;
  myInfoP.textContent = `내 정보: ${myName} (id: ${myId})`;
});

// 플레이어 목록 갱신
socket.on('playerList', (players) => {
  playerListDiv.innerHTML = '';
  if (players.length === 0) {
    playerListDiv.textContent = '없음';
    return;
  }

  players.forEach(p => {
    const line = document.createElement('div');
    line.textContent = `${p.name} (${p.id === myId ? '나' : p.id})`;
    playerListDiv.appendChild(line);
  });
});

// 턴 변경 알림
socket.on('turnChanged', ({ currentPlayerId, currentPlayerName }) => {
  currentTurnId = currentPlayerId;

  if (currentTurnId === myId) {
    turnInfoP.textContent = `현재 턴: ${currentPlayerName} (내 턴!)`;
    rollBtn.disabled = false;
  } else {
    turnInfoP.textContent = `현재 턴: ${currentPlayerName}`;
    rollBtn.disabled = true;
  }
});

// 주사위 결과 받기
socket.on('diceRolled', (data) => {
  const { rollerId, rollerName, value, nextPlayerId, nextPlayerName } = data;

  lastRollP.textContent = `마지막 주사위: ${rollerName} → ${value}`;
  addLog(`${rollerName}가 주사위를 굴려서 ${value}가 나왔습니다.`);

  // 다음 턴 정보 갱신
  currentTurnId = nextPlayerId;
  if (currentTurnId === myId) {
    turnInfoP.textContent = `현재 턴: ${nextPlayerName} (내 턴!)`;
    rollBtn.disabled = false;
  } else {
    turnInfoP.textContent = `현재 턴: ${nextPlayerName}`;
    rollBtn.disabled = true;
  }
});

// 방이 가득 찼을 때
socket.on('roomFull', () => {
  alert('방이 이미 2명으로 가득 찼습니다!');
  myInfoP.textContent = '방이 가득 찼습니다. 관전자 모드';
  rollBtn.disabled = true;
});

// 내 턴이 아니라고 서버가 알려줄 때
socket.on('notYourTurn', () => {
  addLog('⚠ 아직 네 턴이 아닙니다!');
});

// 버튼 클릭 → 주사위 굴리기 요청
rollBtn.addEventListener('click', () => {
  socket.emit('rollDice');
});
