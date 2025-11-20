// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 플레이어 상태
// { id, name, avatar, index, money }
let players = [];
let currentTurn = null;

io.on('connection', (socket) => {
  console.log('새 유저 접속:', socket.id);

  // 2인까지만
  if (players.length >= 2) {
    socket.emit('roomFull');
    console.log('방이 가득 차서 거절:', socket.id);
    return;
  }

  const playerIndex = players.length + 1;
  const player = {
    id: socket.id,
    name: null,
    avatar: null,
    index: playerIndex,
    money: 0,
  };
  players.push(player);

  // 클라이언트에게 "프로필 보내줘" 신호
  socket.emit('awaitProfile', {
    suggestedName: `Player ${playerIndex}`,
  });

  // 프로필 등록
  socket.on('registerProfile', (data) => {
    if (!player) return;

    const nameFromClient = data?.name ?? '';
    player.name =
      String(nameFromClient).trim() || `Player ${playerIndex}`;
    player.avatar = data?.avatar || null;

    // 자기 정보 보내기
    socket.emit('playerInfo', {
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      index: player.index,
      money: player.money,
    });

    // 모두에게 플레이어 리스트 방송
    broadcastPlayerList();

    // 두 명 다 들어왔고, 아직 턴이 없으면 1번부터 시작
    if (players.length === 2 && !currentTurn) {
      currentTurn = players[0].id;
      io.emit('turnChanged', {
        currentPlayerId: currentTurn,
        currentPlayerName: players[0].name,
      });
    }
  });

  // 주사위 굴리기 (아직은 그냥 1개짜리 간단 버전)
  socket.on('rollDice', () => {
    if (!currentTurn || socket.id !== currentTurn) {
      socket.emit('notYourTurn');
      return;
    }

    const roller = players.find((p) => p.id === socket.id);
    if (!roller) return;

    const value = Math.floor(Math.random() * 6) + 1; // 1~6

    const currentIndex = players.findIndex(
      (p) => p.id === currentTurn,
    );
    const nextIndex = (currentIndex + 1) % players.length;
    currentTurn = players[nextIndex].id;
    const nextPlayer = players[nextIndex];

    io.emit('diceRolled', {
      rollerId: roller.id,
      rollerName: roller.name,
      value,
      nextPlayerId: currentTurn,
      nextPlayerName: nextPlayer.name,
    });
  });

  socket.on('disconnect', () => {
    console.log('유저 나감:', socket.id);
    const wasTurn = socket.id === currentTurn;

    players = players.filter((p) => p.id !== socket.id);

    if (wasTurn) {
      if (players.length >= 1) {
        currentTurn = players[0].id;
        io.emit('turnChanged', {
          currentPlayerId: currentTurn,
          currentPlayerName: players[0].name,
        });
      } else {
        currentTurn = null;
      }
    }

    broadcastPlayerList();
  });
});

function broadcastPlayerList() {
  io.emit(
    'playerList',
    players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      index: p.index,
      money: p.money,
    })),
  );
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
