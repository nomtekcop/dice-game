import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// public 폴더를 정적 파일 제공용으로 사용
app.use(express.static('public'));

// 게임 상태(서버에서 관리)
let players = [];      // [{ id: socket.id, name: 'Player 1' }, ...]
let currentTurn = null; // socket.id 저장
let lastRoll = null;    // 마지막 주사위 결과

io.on('connection', (socket) => {
  console.log('새 유저 접속:', socket.id);

  // 이미 2명이 꽉 찼으면
  if (players.length >= 2) {
    socket.emit('roomFull');
    console.log('방이 가득 차서 거절:', socket.id);
    return;
  }

  // 플레이어 추가
  const playerNumber = players.length + 1;
  const player = { id: socket.id, name: `Player ${playerNumber}` };
  players.push(player);

  console.log('플레이어 목록:', players);

  // 이 유저에게 자신의 정보 보내기
  socket.emit('playerInfo', {
    id: socket.id,
    name: player.name
  });

  // 모든 유저에게 현재 플레이어들 정보 보내기
  io.emit('playerList', players);

  // 두 명이 모두 들어왔으면, Player 1부터 시작
  if (players.length === 2 && !currentTurn) {
    currentTurn = players[0].id;
    io.emit('turnChanged', {
      currentPlayerId: currentTurn,
      currentPlayerName: players[0].name
    });
  }

  // 클라이언트가 "rollDice" 요청함
  socket.on('rollDice', () => {
    // 아직 턴이 안 정해졌으면 무시
    if (!currentTurn) return;

    // 지금 턴이 아니면 무시
    if (socket.id !== currentTurn) {
      socket.emit('notYourTurn');
      return;
    }

    // 1 ~ 6 사이 랜덤 주사위
    const roll = Math.floor(Math.random() * 6) + 1;
    lastRoll = roll;

    // 다음 턴 플레이어 계산 (2명만 있다고 가정)
    const currentIndex = players.findIndex(p => p.id === currentTurn);
    const nextIndex = (currentIndex + 1) % players.length;
    currentTurn = players[nextIndex].id;

    const currentPlayer = players[currentIndex];
    const nextPlayer = players[nextIndex];

    // 모든 유저에게 결과 방송
    io.emit('diceRolled', {
      rollerId: socket.id,
      rollerName: currentPlayer.name,
      value: roll,
      nextPlayerId: currentTurn,
      nextPlayerName: nextPlayer.name
    });
  });

  // 유저가 나갔을 때
  socket.on('disconnect', () => {
    console.log('유저 나감:', socket.id);
    players = players.filter(p => p.id !== socket.id);

    // 나간 애가 턴이었으면 턴 초기화 또는 남은 사람에게 넘기기
    if (socket.id === currentTurn) {
      if (players.length >= 1) {
        currentTurn = players[0].id;
        io.emit('turnChanged', {
          currentPlayerId: currentTurn,
          currentPlayerName: players[0].name
        });
      } else {
        currentTurn = null;
      }
    }

    // 플레이어 목록 갱신 브로드캐스트
    io.emit('playerList', players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
