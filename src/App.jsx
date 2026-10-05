import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';

// ==========================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

let app, db;
let firebaseError = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase Initialization Error:", error);
  firebaseError = error.message;
}

// ==========================================
// 2. MAHJONG CONSTANTS & LOGIC
// ==========================================
const TILE_TYPES = {
  BAMBOO: 'BAMBOO', CHARACTER: 'CHARACTER', DOT: 'DOT',
  WIND: 'WIND', DRAGON: 'DRAGON',
  ANIMAL: 'ANIMAL', FLOWER: 'FLOWER', JOKER: 'JOKER'
};

const SORT_WEIGHT = {
  [TILE_TYPES.CHARACTER]: 100, [TILE_TYPES.BAMBOO]: 200, [TILE_TYPES.DOT]: 300,
  [TILE_TYPES.WIND]: 400, [TILE_TYPES.DRAGON]: 500,
  [TILE_TYPES.ANIMAL]: 600, [TILE_TYPES.FLOWER]: 700, [TILE_TYPES.JOKER]: 800
};

const WINDS = ['東', '南', '西', '北']; 

const generateDeck = (jokerCount) => {
  let deck = [];
  [TILE_TYPES.BAMBOO, TILE_TYPES.CHARACTER, TILE_TYPES.DOT, TILE_TYPES.WIND, TILE_TYPES.DRAGON].forEach(suit => {
    const limit = (suit === TILE_TYPES.WIND) ? 4 : (suit === TILE_TYPES.DRAGON) ? 3 : 9;
    for (let index = 0; index < limit; index++) {
      for (let i = 0; i < 4; i++) deck.push({ id: `${suit}_${index}_${i}`, type: suit, value: index + 1 });
    }
  });
  for (let index = 0; index < 4; index++) deck.push({ id: `ANIMAL_${index}`, type: TILE_TYPES.ANIMAL, value: index + 1 });
  for (let index = 0; index < 8; index++) deck.push({ id: `FLOWER_${index}`, type: TILE_TYPES.FLOWER, value: index + 1 });
  for (let i = 0; i < jokerCount; i++) deck.push({ id: `JOKER_${i}`, type: TILE_TYPES.JOKER, value: 99 });

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const sortHand = (hand) => {
  if (!hand || !Array.isArray(hand)) return [];
  return [...hand].sort((a, b) => (SORT_WEIGHT[a.type] + a.value) - (SORT_WEIGHT[b.type] + b.value));
};

// ==========================================
// 3. PURE VECTOR (SVG) TILE RENDERING ENGINE
// ==========================================
const DotSvg = ({ value }) => {
  const c = (cx, cy, r, fill) => (
    <g key={`${cx},${cy}`}>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r * 0.6} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r * 0.25} fill="#ffffff" />
    </g>
  );
  
  const R = "#dc2626", B = "#2563eb", G = "#16a34a";
  let circles = [];
  
  if (value === 1) return (
    <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-md">
      <circle cx="50" cy="70" r="38" fill="#dc2626" />
      <circle cx="50" cy="70" r="28" fill="none" stroke="#fca5a5" strokeWidth="4" strokeDasharray="6 4" />
      <circle cx="50" cy="70" r="14" fill="#fca5a5" />
      <circle cx="50" cy="70" r="6" fill="#7f1d1d" />
    </svg>
  );

  if (value === 2) circles = [c(50,35,20, G), c(50,105,20, B)];
  if (value === 3) circles = [c(25,30,16, B), c(50,70,16, R), c(75,110,16, G)];
  if (value === 4) circles = [c(30,35,18, B), c(70,35,18, G), c(30,105,18, G), c(70,105,18, B)];
  if (value === 5) circles = [c(30,30,16, B), c(70,30,16, G), c(50,70,16, R), c(30,110,16, G), c(70,110,16, B)];
  if (value === 6) circles = [c(30,25,16, G), c(70,25,16, G), c(30,70,16, R), c(70,70,16, R), c(30,115,16, R), c(70,115,16, R)];
  if (value === 7) circles = [c(20,25,12, G), c(50,45,12, G), c(80,65,12, G), c(30,100,14, R), c(70,100,14, R), c(30,130,14, R), c(70,130,14, R)];
  if (value === 8) circles = [25,55,85,115].flatMap(y => [c(30,y,12, B), c(70,y,12, B)]);
  if (value === 9) circles = [25,70,115].flatMap((y, i) => [20,50,80].map(x => c(x,y,13, [B,R,G][i])));
  return <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-sm">{circles}</svg>;
};

const BamSvg = ({ value }) => {
  if (value === 1) return <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-md"><text x="50" y="100" fontSize="80" textAnchor="middle">🦚</text></svg>;
  
  const b = (cx, cy, fill, rot = 0) => (
    <g key={`${cx},${cy},${rot}`} transform={`rotate(${rot}, ${cx}, ${cy})`}>
      <rect x={cx-6} y={cy-16} width="12" height="32" rx="3" fill={fill} stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
      <line x1={cx-5} y1={cy} x2={cx+5} y2={cy} stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
      <line x1={cx-4} y1={cy-10} x2={cx+4} y2={cy-10} stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <line x1={cx-4} y1={cy+10} x2={cx+4} y2={cy+10} stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <line x1={cx-2} y1={cy-14} x2={cx-2} y2={cy+14} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    </g>
  );

  const R = "#dc2626", G = "#16a34a", B = "#2563eb";
  let pills = [];
  
  if (value === 2) pills = [b(50,35, G), b(50,105, B)];
  if (value === 3) pills = [b(50,35, B), b(30,105, G), b(70,105, G)];
  if (value === 4) pills = [b(30,35, B), b(70,35, G), b(30,105, G), b(70,105, B)];
  if (value === 5) pills = [b(30,30, G), b(70,30, B), b(50,70, R), b(30,110, B), b(70,110, G)];
  if (value === 6) pills = [b(25,35, G), b(50,35, G), b(75,35, G), b(25,105, B), b(50,105, B), b(75,105, B)];
  if (value === 7) pills = [b(50,25, R), b(25,70, G), b(50,70, G), b(75,70, G), b(25,115, B), b(50,115, B), b(75,115, B)];
  if (value === 8) pills = [
    b(25, 35, G), b(75, 35, G), b(38, 45, G, 45), b(62, 45, G, -45), 
    b(25, 105, B), b(75, 105, B), b(38, 95, B, -45), b(62, 95, B, 45)
  ];
  if (value === 9) pills = [25,70,115].flatMap((y, i) => [25,50,75].map(x => b(x,y, [R,B,G][i])));
  return <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-sm">{pills}</svg>;
};

const CharSvg = ({ value }) => {
  const chars = ['一', '二', '三', '四', '伍', '六', '七', '八', '九'];
  return (
    <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-sm">
      <text x="50" y="55" fontSize="45" fontWeight="bold" fill="#1e3a8a" textAnchor="middle" fontFamily="sans-serif">{chars[value-1]}</text>
      <text x="50" y="115" fontSize="55" fontWeight="900" fill="#dc2626" textAnchor="middle" fontFamily="sans-serif">萬</text>
    </svg>
  );
};

const TileFace = ({ type, value }) => {
  if (type === TILE_TYPES.CHARACTER) return <CharSvg value={value} />;
  if (type === TILE_TYPES.DOT) return <DotSvg value={value} />;
  if (type === TILE_TYPES.BAMBOO) return <BamSvg value={value} />;
  
  if (type === TILE_TYPES.WIND) {
    const chars = ['東', '南', '西', '北'];
    return <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-md"><text x="50" y="90" fontSize="70" fontWeight="bold" fill="#1e3a8a" textAnchor="middle" fontFamily="sans-serif">{chars[value-1]}</text></svg>;
  }
  if (type === TILE_TYPES.DRAGON) {
    if (value === 1) return <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-md"><text x="50" y="90" fontSize="70" fontWeight="bold" fill="#dc2626" textAnchor="middle" fontFamily="sans-serif">中</text></svg>;
    if (value === 2) return <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-md"><text x="50" y="90" fontSize="70" fontWeight="bold" fill="#16a34a" textAnchor="middle" fontFamily="sans-serif">發</text></svg>;
    if (value === 3) return <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-md"><rect x="25" y="30" width="50" height="80" fill="none" stroke="#2563eb" strokeWidth="8" rx="4" /></svg>;
  }
  if (type === TILE_TYPES.JOKER) return <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-md"><text x="50" y="90" fontSize="70" fontWeight="900" fill="#dc2626" textAnchor="middle" fontFamily="sans-serif">飛</text></svg>;
  if (type === TILE_TYPES.ANIMAL) {
    const chars = ['🐱', '🐭', '🐓', '🐛'];
    return <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-md"><text x="50" y="95" fontSize="60" textAnchor="middle">{chars[value-1]}</text></svg>;
  }
  if (type === TILE_TYPES.FLOWER) {
    const chars = ['春', '夏', '秋', '冬', '梅', '蘭', '菊', '竹'];
    return (
      <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-md">
        <text x="80" y="30" fontSize="20" fontWeight="bold" fill="#dc2626" textAnchor="middle">{value}</text>
        <text x="50" y="100" fontSize="60" fontWeight="black" fill="#047857" textAnchor="middle" fontFamily="sans-serif">{chars[value-1]}</text>
      </svg>
    );
  }
  return null;
};

const MahjongTile = ({ tile, onClick, isHidden, isSelected, className = '', isHand = false }) => {
  if (isHidden) {
    return <div className={`bg-gradient-to-br from-emerald-700 to-emerald-900 rounded-md shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] border-t border-emerald-500/50 ${className}`} />;
  }

  let specialBg = 'bg-gradient-to-b from-[#f8f9fa] to-[#e2e8f0]';
  let specialShadow = 'shadow-[0_4px_0_0_#94a3b8,0_6px_10px_rgba(0,0,0,0.4)]';
  
  if (tile.type === TILE_TYPES.JOKER) {
    specialBg = 'bg-gradient-to-br from-[#fde68a] to-[#d97706]';
    specialShadow = 'shadow-[0_4px_0_0_#92400e,0_6px_10px_rgba(0,0,0,0.4)]';
  } else if (tile.type === TILE_TYPES.ANIMAL) {
    specialBg = 'bg-gradient-to-br from-orange-200 to-red-300';
  } else if (tile.type === TILE_TYPES.FLOWER) {
    specialBg = 'bg-gradient-to-br from-pink-100 to-rose-300';
  }

  const selectedStyle = isSelected ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-[#0f281e] -translate-y-4 sm:-translate-y-6 shadow-[0_15px_30px_rgba(245,158,11,0.6)] z-20' : '';

  return (
    <div 
      onClick={onClick}
      className={`rounded-xl border border-white/60 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 group relative select-none p-1.5 sm:p-2 ${specialBg} ${specialShadow} ${selectedStyle} ${className} ${isHand && !isSelected ? 'hover:-translate-y-4 sm:hover:-translate-y-6 hover:shadow-[0_12px_0_0_#94a3b8,0_15px_25px_rgba(0,0,0,0.5)] z-10' : ''}`}
    >
      <div className="flex items-center justify-center transition-transform group-hover:scale-105 w-full h-full">
         <TileFace type={tile.type} value={tile.value} />
      </div>
      <span className="absolute top-1 left-1 text-[8px] sm:text-[10px] text-black/30 font-sans opacity-0 group-hover:opacity-100 font-black uppercase tracking-tighter">
        {tile.type.substring(0, 3)}
      </span>
    </div>
  );
};

// ==========================================
// 4. MOBILE ROTATE LOCK OVERLAY
// ==========================================
const OrientationOverlay = () => (
  <>
    <style>{`
      @keyframes phoneRotate {
        0% { transform: rotate(0deg); }
        50%, 100% { transform: rotate(-90deg); }
      }
      .animate-phone-rotate {
        animation: phoneRotate 2s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
      }
    `}</style>
    <div className="fixed inset-0 z-[9999] hidden portrait:flex flex-col items-center justify-center bg-[#050814] text-center px-6">
      <div className="w-24 h-36 border-4 border-emerald-400 rounded-3xl mb-10 flex items-center justify-center relative animate-phone-rotate shadow-[0_0_40px_rgba(52,211,153,0.3)] bg-[#0a1128]">
        <div className="absolute top-2 w-8 h-1.5 bg-emerald-400/50 rounded-full"></div>
        <div className="absolute bottom-3 w-5 h-5 rounded-full border-2 border-emerald-400/50"></div>
        <div className="text-5xl animate-pulse">🔄</div>
      </div>
      <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-cyan-400 mb-4 tracking-tighter uppercase">Rotate Device</h2>
      <p className="text-emerald-500/80 font-medium text-lg max-w-sm">
        Mahjong Fei Madness requires a landscape layout. Please turn your phone sideways to play.
      </p>
    </div>
  </>
);

// ==========================================
// 5. MAIN APPLICATION
// ==========================================
export default function App() {
  const [playerId, setPlayerId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  
  const [jokers, setJokers] = useState(4);
  const [maxTai, setMaxTai] = useState(5);
  const [ziMoBonus, setZiMoBonus] = useState(2);
  
  const [inGame, setInGame] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(firebaseError || '');
  const [loading, setLoading] = useState(false);
  
  const [showHuModal, setShowHuModal] = useState(false);
  const [huTai, setHuTai] = useState(1);
  const [huType, setHuType] = useState('shooter');
  const [huShooterId, setHuShooterId] = useState('');

  const [zhaHuPenalty, setZhaHuPenalty] = useState(0);

  const [meldMode, setMeldMode] = useState(null);
  const [selectedForMeld, setSelectedForMeld] = useState([]);
  const [timeLeft, setTimeLeft] = useState(10);

  useEffect(() => {
    if (!playerId) {
      const savedId = localStorage.getItem('sg_mahjong_id') || `p_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('sg_mahjong_id', savedId);
      setPlayerId(savedId);
    }
  }, [playerId]);

  useEffect(() => {
    if (inGame && roomCode && db) {
      setLoading(true);
      const unsub = onSnapshot(doc(db, 'rooms', roomCode), (docSnap) => {
        if (docSnap.exists()) { setGameState(docSnap.data()); setError(''); } 
        else { setError('Room closed.'); setInGame(false); }
        setLoading(false);
      }, (err) => { setError('Connection lost.'); setLoading(false); });
      return () => unsub();
    }
  }, [inGame, roomCode]);

  useEffect(() => {
    let timer;
    if (gameState?.latestDiscard && gameState.latestDiscard.fromPlayerId !== playerId && !gameState.latestDiscard.skips?.includes(playerId)) {
      const calculateTimeLeft = () => Math.max(0, Math.floor((gameState.latestDiscard.expiresAt - Date.now()) / 1000));
      setTimeLeft(calculateTimeLeft());
      timer = setInterval(() => {
        const remaining = calculateTimeLeft();
        setTimeLeft(remaining);
        if (remaining <= 0) { handleSkipInterrupt(); clearInterval(timer); }
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [gameState?.latestDiscard, playerId]);

  useEffect(() => {
    let checkCleanup;
    if (inGame && gameState?.latestDiscard && gameState.hostId === playerId) {
      checkCleanup = setInterval(() => {
        const skips = gameState.latestDiscard.skips || [];
        const allSkipped = skips.length >= (gameState.playerOrder.length - 1);
        const expired = Date.now() > gameState.latestDiscard.expiresAt;
        if (allSkipped || expired) updateDoc(doc(db, 'rooms', roomCode), { latestDiscard: null });
      }, 1000);
    }
    return () => { if (checkCleanup) clearInterval(checkCleanup); };
  }, [gameState?.latestDiscard, gameState?.hostId, playerId, inGame, roomCode]);

  useEffect(() => {
    if (!inGame || !gameState || gameState.status !== 'playing' || gameState.hostId !== playerId) return;
    const currentTurnId = gameState.playerOrder[gameState.currentTurnIndex];
    const currentPlayer = gameState.players[currentTurnId];
    if (gameState.latestDiscard) return;

    if (currentPlayer?.isBot) {
      const playBotTurn = async () => {
        await new Promise(r => setTimeout(r, 1500));
        const roomRef = doc(db, 'rooms', roomCode);
        const snap = await getDoc(roomRef);
        if (!snap.exists()) return;
        let latestState = snap.data();
        if (latestState.status !== 'playing' || latestState.playerOrder[latestState.currentTurnIndex] !== currentTurnId || latestState.latestDiscard) return;

        let deck = JSON.parse(JSON.stringify(latestState.deck));
        let players = JSON.parse(JSON.stringify(latestState.players));
        let discards = JSON.parse(JSON.stringify(latestState.discards || []));
        let bot = players[currentTurnId];

        if (deck.length > 0) {
           bot.flowers = bot.flowers || [];
           let drawnTile = deck.shift();
           while (drawnTile && (drawnTile.type === TILE_TYPES.FLOWER || drawnTile.type === TILE_TYPES.ANIMAL) && deck.length > 0) {
             bot.flowers.push(drawnTile); drawnTile = deck.shift();
           }
           if (drawnTile) {
             if (drawnTile.type === TILE_TYPES.FLOWER || drawnTile.type === TILE_TYPES.ANIMAL) bot.flowers.push(drawnTile);
             else bot.hand.push(drawnTile);
           }
        }
        if (bot.hand.length > 0) {
           let discardIdx = 0;
           const nonJokers = bot.hand.map((t, i) => ({t, i})).filter(x => x.t.type !== TILE_TYPES.JOKER);
           if (nonJokers.length > 0) discardIdx = nonJokers[Math.floor(Math.random() * nonJokers.length)].i;
           else discardIdx = Math.floor(Math.random() * bot.hand.length);

           const discardedTile = bot.hand.splice(discardIdx, 1)[0];
           discards.push(discardedTile);
           bot.hand = sortHand(bot.hand);
           const nextTurn = (latestState.currentTurnIndex + 1) % latestState.playerOrder.length;
           const botIds = Object.keys(players).filter(id => players[id].isBot && id !== currentTurnId);
           await updateDoc(roomRef, { deck, players, discards, currentTurnIndex: nextTurn, latestDiscard: { tile: discardedTile, fromPlayerId: currentTurnId, expiresAt: Date.now() + 10000, skips: botIds } });
        }
      };
      playBotTurn();
    }
  }, [gameState?.currentTurnIndex, gameState?.status, gameState?.latestDiscard]);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!playerName.trim()) return setError('Please enter a name');
    setLoading(true);
    const newRoomCode = Math.random().toString(36).substr(2, 5).toUpperCase();
    try {
      await setDoc(doc(db, 'rooms', newRoomCode), {
        status: 'waiting', settings: { jokers, maxTai, ziMoBonus },
        players: { [playerId]: { name: playerName, hand: [], flowers: [], melds: [], balance: 1000, isBot: false } },
        playerOrder: [playerId], deck: generateDeck(jokers), discards: [], currentTurnIndex: 0, eastIndex: 0, hostId: playerId, winner: null, latestDiscard: null
      });
      setRoomCode(newRoomCode); setInGame(true); setError('');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!playerName.trim() || !roomCode.trim()) return setError('Enter name and room code');
    setLoading(true);
    const code = roomCode.toUpperCase();
    try {
      const roomRef = doc(db, 'rooms', code);
      const docSnap = await getDoc(roomRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!data.players[playerId]) {
          await updateDoc(roomRef, { [`players.${playerId}`]: { name: playerName, hand: [], flowers: [], melds: [], balance: 1000, isBot: false }, playerOrder: arrayUnion(playerId) });
        }
        setRoomCode(code); setInGame(true);
      } else setError('Room not found!');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleAddBot = async () => {
    const botId = `bot_${Math.random().toString(36).substr(2, 5)}`;
    await updateDoc(doc(db, 'rooms', roomCode), { [`players.${botId}`]: { name: `Bot ${gameState.playerOrder.length}`, hand: [], flowers: [], melds: [], balance: 1000, isBot: true }, playerOrder: arrayUnion(botId) });
  };

  const startGame = async () => {
    if (!gameState || gameState.hostId !== playerId) return;
    const isFirstRound = gameState.status === 'waiting';
    let newEastIndex = gameState.eastIndex !== undefined ? gameState.eastIndex : 0;
    let d1 = 1, d2 = 1, sum = 2;

    if (isFirstRound) {
      d1 = Math.floor(Math.random() * 6) + 1;
      d2 = Math.floor(Math.random() * 6) + 1;
      sum = d1 + d2;
      newEastIndex = (newEastIndex + (sum - 1)) % gameState.playerOrder.length;
    } else {
      if (gameState.winnerId && gameState.winnerId !== gameState.playerOrder[gameState.eastIndex]) {
        newEastIndex = (gameState.eastIndex + 1) % gameState.playerOrder.length;
      }
    }

    let freshDeck = generateDeck(gameState.settings.jokers);
    let players = JSON.parse(JSON.stringify(gameState.players));
    
    gameState.playerOrder.forEach(pId => {
      if (players[pId]) {
        let hand = [], flowers = [];
        while (hand.length < 13 && freshDeck.length > 0) {
          const tile = freshDeck.shift();
          if (tile.type === TILE_TYPES.FLOWER || tile.type === TILE_TYPES.ANIMAL) flowers.push(tile);
          else hand.push(tile);
        }
        players[pId].hand = sortHand(hand); players[pId].flowers = flowers; players[pId].melds = []; 
      }
    });

    if (isFirstRound) {
      await updateDoc(doc(db, 'rooms', roomCode), { status: 'rolling', dice: { d1, d2, sum }, eastIndex: newEastIndex, currentTurnIndex: newEastIndex, players, deck: freshDeck, discards: [], winner: null, winnerId: null, latestDiscard: null, winDetails: null });
      setTimeout(() => { updateDoc(doc(db, 'rooms', roomCode), { status: 'playing' }); }, 4000);
    } else {
      await updateDoc(doc(db, 'rooms', roomCode), { status: 'playing', eastIndex: newEastIndex, currentTurnIndex: newEastIndex, players, deck: freshDeck, discards: [], winner: null, winnerId: null, latestDiscard: null, winDetails: null });
    }
  };

  const drawTile = async () => {
    if (gameState.deck.length === 0) return;
    let currentDeck = JSON.parse(JSON.stringify(gameState.deck));
    let players = JSON.parse(JSON.stringify(gameState.players));
    let p = players[playerId];
    p.flowers = p.flowers || [];
    let drawnTile = currentDeck.shift();
    while (drawnTile && (drawnTile.type === TILE_TYPES.FLOWER || drawnTile.type === TILE_TYPES.ANIMAL) && currentDeck.length > 0) {
      p.flowers.push(drawnTile); drawnTile = currentDeck.shift();
    }
    if (drawnTile) {
      if (drawnTile.type === TILE_TYPES.FLOWER || drawnTile.type === TILE_TYPES.ANIMAL) p.flowers.push(drawnTile);
      else { p.hand.push(drawnTile); p.hand = sortHand(p.hand); }
    }
    await updateDoc(doc(db, 'rooms', roomCode), { deck: currentDeck, players, latestDiscard: null });
  };

  const discardTile = async (tileIndex) => {
    let players = JSON.parse(JSON.stringify(gameState.players));
    let discards = JSON.parse(JSON.stringify(gameState.discards || []));
    const discardedTile = players[playerId].hand.splice(tileIndex, 1)[0];
    discards.push(discardedTile);
    players[playerId].hand = sortHand(players[playerId].hand);
    const nextTurn = (gameState.currentTurnIndex + 1) % gameState.playerOrder.length;
    const bots = Object.keys(players).filter(id => players[id].isBot && id !== playerId);
    setMeldMode(null); setSelectedForMeld([]);
    await updateDoc(doc(db, 'rooms', roomCode), { players, discards, currentTurnIndex: nextTurn, latestDiscard: { tile: discardedTile, fromPlayerId: playerId, expiresAt: Date.now() + 10000, skips: bots } });
  };

  const startMeldSelection = (type) => { setMeldMode(type); setSelectedForMeld([]); };
  const cancelMeldSelection = () => { setMeldMode(null); setSelectedForMeld([]); };

  const handleSkipInterrupt = async () => {
    if (!gameState?.latestDiscard || gameState.latestDiscard.skips?.includes(playerId)) return;
    setMeldMode(null); setSelectedForMeld([]);
    await updateDoc(doc(db, 'rooms', roomCode), { 'latestDiscard.skips': arrayUnion(playerId) });
  };

  const confirmMeld = async () => {
    if (meldMode !== 'self_kong' && !gameState.latestDiscard) return;
    const reqCount = meldMode === 'self_kong' ? 4 : (meldMode === 'kong' ? 3 : 2);
    if (selectedForMeld.length !== reqCount) return;
    let players = JSON.parse(JSON.stringify(gameState.players));
    let discards = JSON.parse(JSON.stringify(gameState.discards || []));
    let deck = JSON.parse(JSON.stringify(gameState.deck));
    
    const sortedIndices = [...selectedForMeld].sort((a, b) => b - a);
    const meldTiles = [];
    for (let idx of sortedIndices) meldTiles.push(players[playerId].hand.splice(idx, 1)[0]);
    if (meldMode !== 'self_kong') meldTiles.push(discards.pop()); 
    
    players[playerId].melds = players[playerId].melds || [];
    players[playerId].melds.push({ tiles: sortHand(meldTiles) });
    if ((meldMode === 'kong' || meldMode === 'self_kong') && deck.length > 0) {
      players[playerId].hand.push(deck.shift()); players[playerId].hand = sortHand(players[playerId].hand);
    }

    if (meldMode === 'self_kong') await updateDoc(doc(db, 'rooms', roomCode), { players, deck });
    else await updateDoc(doc(db, 'rooms', roomCode), { players, discards, deck, currentTurnIndex: gameState.playerOrder.indexOf(playerId), latestDiscard: null });
    setMeldMode(null); setSelectedForMeld([]);
  };

  const handleConfirmHu = async () => {
    let players = JSON.parse(JSON.stringify(gameState.players));
    const maxTaiSetting = gameState.settings?.maxTai || 5;
    const cappedTai = Math.min(huTai, maxTaiSetting);
    const rates = { 1:2, 2:4, 3:8, 4:16, 5:32, 6:64 }[cappedTai] || 2; 
    const ziMoBonusAmt = gameState.settings?.ziMoBonus || 0;
    let totalGain = 0;

    if (huType === 'shooter') {
      const payment = rates * 2;
      players[huShooterId].balance -= payment;
      totalGain += payment;
      if (gameState.latestDiscard && gameState.latestDiscard.fromPlayerId === huShooterId) {
         players[playerId].hand.push(gameState.latestDiscard.tile);
         players[playerId].hand = sortHand(players[playerId].hand);
      }
    } else {
      gameState.playerOrder.forEach(pId => {
        if (pId !== playerId) { const payment = rates + ziMoBonusAmt; players[pId].balance -= payment; totalGain += payment; }
      });
    }

    players[playerId].balance += totalGain;
    await updateDoc(doc(db, 'rooms', roomCode), { 
      status: 'finished', players, winner: players[playerId].name, winnerId: playerId, winningHand: players[playerId].hand, winDetails: { tai: huTai, amount: totalGain, isZiMo: huType === 'zimo', ziMoBonus: ziMoBonusAmt, shooterId: huShooterId }, latestDiscard: null
    });
    setShowHuModal(false);
  };

  const reportZhaHu = async () => {
    let players = JSON.parse(JSON.stringify(gameState.players));
    const winDetails = gameState.winDetails;
    const fakeWinnerId = gameState.winnerId;

    if (winDetails) {
      players[fakeWinnerId].balance -= winDetails.amount;
      if (winDetails.isZiMo) {
        const refund = winDetails.amount / (gameState.playerOrder.length - 1);
        gameState.playerOrder.forEach(pId => { if (pId !== fakeWinnerId) players[pId].balance += refund; });
      } else if (winDetails.shooterId) {
        players[winDetails.shooterId].balance += winDetails.amount;
      }
    }

    await updateDoc(doc(db, 'rooms', roomCode), { status: 'zha_hu', players });
  };

  const handlePayZhaHu = async () => {
    let players = JSON.parse(JSON.stringify(gameState.players));
    const penalty = parseInt(zhaHuPenalty) || 0;
    players[gameState.winnerId].balance -= (penalty * (gameState.playerOrder.length - 1));
    gameState.playerOrder.forEach(pId => { if (pId !== gameState.winnerId) players[pId].balance += penalty; });

    const newEastIndex = (gameState.eastIndex + 1) % gameState.playerOrder.length;
    let freshDeck = generateDeck(gameState.settings.jokers);
    
    gameState.playerOrder.forEach(pId => {
      if (players[pId]) {
        let hand = [], flowers = [];
        while (hand.length < 13 && freshDeck.length > 0) {
          const tile = freshDeck.shift();
          if (tile.type === TILE_TYPES.FLOWER || tile.type === TILE_TYPES.ANIMAL) flowers.push(tile);
          else hand.push(tile);
        }
        players[pId].hand = sortHand(hand); players[pId].flowers = flowers; players[pId].melds = []; 
      }
    });

    await updateDoc(doc(db, 'rooms', roomCode), { 
      status: 'playing', eastIndex: newEastIndex, currentTurnIndex: newEastIndex,
      players, deck: freshDeck, discards: [], winner: null, winnerId: null, latestDiscard: null, winDetails: null
    });
  };

  // ==========================================
  // RENDER BLOCKS
  // ==========================================
  if (!inGame) {
    return (
      <div className="min-h-screen overscroll-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-[#0a1128] to-[#050814] flex items-center justify-center p-4 font-sans relative overflow-hidden">
        <OrientationOverlay />
        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-10">
            <p className="text-emerald-400/60 font-bold tracking-[0.3em] text-xs uppercase mb-2">SAN STUDIO PRESENTS</p>
            <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-cyan-400 tracking-tighter mb-2 drop-shadow-lg leading-tight">MAHJONG FEI MADNESS</h1>
            <p className="text-emerald-500/80 font-medium tracking-widest text-sm uppercase">by JAY Designs</p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 relative overflow-hidden">
            {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-red-400 text-sm">⚠ <p>{error}</p></div>}
            <div className="space-y-6 relative z-10">
              <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={12} className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none font-semibold text-lg" placeholder="Player Name..." />
              <div className="grid grid-cols-2 gap-4">
                <button onClick={handleJoinRoom} disabled={loading} className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-4 px-4 rounded-2xl transition-all border border-white/10">Join Game</button>
                <input type="text" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} maxLength={5} className="w-full px-4 py-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none uppercase text-center font-mono font-bold text-xl tracking-[0.2em]" placeholder="CODE" />
              </div>
              <div className="bg-black/20 p-5 rounded-2xl border border-white/5 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-white/70 flex justify-between items-end"><span>Jokers (Fei)</span><span className="text-emerald-400 font-black text-xl leading-none">{jokers}</span></label>
                  <input type="range" min="0" max="24" step="4" value={jokers} onChange={(e) => setJokers(parseInt(e.target.value))} className="w-full accent-emerald-500 h-1 bg-white/10 rounded-full appearance-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-white/70 flex justify-between items-end"><span>Max Tai</span><span className="text-emerald-400 font-black text-xl leading-none">{maxTai}</span></label>
                  <input type="range" min="5" max="6" step="1" value={maxTai} onChange={(e) => setMaxTai(parseInt(e.target.value))} className="w-full accent-emerald-500 h-1 bg-white/10 rounded-full appearance-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-white/70 flex justify-between items-end"><span>Zi Mo Bonus</span><span className="text-emerald-400 font-black text-xl leading-none">${ziMoBonus}</span></label>
                  <input type="range" min="0" max="10" step="1" value={ziMoBonus} onChange={(e) => setZiMoBonus(parseInt(e.target.value))} className="w-full accent-emerald-500 h-1 bg-white/10 rounded-full appearance-none" />
                </div>
              </div>
              <button onClick={handleCreateRoom} disabled={loading} className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-emerald-950 font-black py-4 px-4 rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] uppercase tracking-widest text-lg">
                {loading ? '🔄' : '▶'} Create Lobby
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const myPlayer = gameState?.players[playerId];
  const allPlayers = gameState?.playerOrder || [];
  const myIndex = allPlayers.indexOf(playerId);
  const topPlayerId = allPlayers[(myIndex + 2) % allPlayers.length];
  const leftPlayerId = allPlayers[(myIndex + 3) % allPlayers.length];
  const rightPlayerId = allPlayers[(myIndex + 1) % allPlayers.length];
  
  const currentTurnPlayerId = allPlayers[gameState?.currentTurnIndex];
  const isMyTurn = currentTurnPlayerId === playerId;
  const canDiscard = (myPlayer?.hand?.length || 0) % 3 === 2;

  const isInterruptWindow = gameState?.latestDiscard && gameState.latestDiscard.fromPlayerId !== playerId && !gameState.latestDiscard.skips?.includes(playerId);
  const isNextTurnMe = gameState?.playerOrder[(gameState?.playerOrder.indexOf(gameState.latestDiscard?.fromPlayerId) + 1) % allPlayers.length] === playerId;

  const getPlayerWind = (pId) => {
    if (gameState?.eastIndex === undefined) return '';
    const pIndex = allPlayers.indexOf(pId);
    const offset = (pIndex - gameState.eastIndex + 4) % 4;
    return WINDS[offset];
  };

  if (gameState?.status === 'waiting') {
    const playersList = gameState.playerOrder.map(id => gameState.players[id]).filter(Boolean);
    const isHost = gameState.hostId === playerId;

    return (
      <div className="min-h-screen overscroll-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-[#0a1128] to-[#050814] flex flex-col items-center justify-center p-4">
        <OrientationOverlay />
        <div className="bg-white/5 backdrop-blur-xl p-10 rounded-3xl shadow-2xl w-full max-w-md text-white border border-white/10 text-center">
          <h2 className="text-3xl font-black mb-2 tracking-tight">Waiting Room</h2>
          <div className="bg-black/40 p-6 rounded-2xl mb-8 border border-white/10 shadow-inner">
            <p className="text-xs text-emerald-400/80 font-bold uppercase tracking-widest mb-2">Room Code</p>
            <p className="text-6xl font-mono font-black text-white tracking-[0.2em]">{roomCode}</p>
          </div>
          <div className="space-y-3 mb-10 text-left">
            <h3 className="font-bold text-white/50 border-b border-white/10 pb-3 flex justify-between text-sm uppercase tracking-wider items-center">
              <span>Players</span>
              <div className="flex items-center gap-4">
                {isHost && playersList.length < 4 && <button onClick={handleAddBot} className="text-xs bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full hover:bg-indigo-500/40">+ Add Bot</button>}
                <span className="text-emerald-400">{playersList.length}/4</span>
              </div>
            </h3>
            {playersList.map((p, i) => (
              <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="bg-emerald-500/20 text-emerald-400 p-2.5 rounded-xl">{p.isBot ? '🤖' : '👤'}</div>
                <div><div className="font-bold text-lg leading-tight">{p.name}</div><div className="text-xs text-emerald-400 font-mono">${p.balance}</div></div>
              </div>
            ))}
          </div>
          {isHost ? <button onClick={startGame} className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 py-4 rounded-2xl font-black text-emerald-950 text-lg uppercase tracking-widest">Start Game</button>
           : <div className="p-4 bg-white/5 rounded-2xl text-center text-white/50">Waiting for host...</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overscroll-none flex flex-col relative overflow-hidden font-sans select-none bg-[#0f281e]">
      <OrientationOverlay />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#164e3b_0%,_#061c13_100%)] opacity-90" />
      
      {gameState?.status === 'rolling' && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-lg">
           <h2 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 mb-12 uppercase tracking-widest animate-pulse drop-shadow-2xl">Rolling for East...</h2>
           <div className="flex gap-8 mb-12">
              <div className="w-32 h-32 bg-white rounded-3xl shadow-[0_0_50px_rgba(255,255,255,0.4)] flex items-center justify-center text-8xl text-slate-900 font-black animate-[spin_1s_ease-out]">{gameState.dice?.d1}</div>
              <div className="w-32 h-32 bg-white rounded-3xl shadow-[0_0_50px_rgba(255,255,255,0.4)] flex items-center justify-center text-8xl text-slate-900 font-black animate-[spin_1.2s_ease-out_reverse]">{gameState.dice?.d2}</div>
           </div>
           <p className="text-3xl text-emerald-400 font-bold mb-4 bg-emerald-900/40 px-8 py-3 rounded-full border border-emerald-500/30">Total: <span className="text-white font-black">{gameState.dice?.sum}</span></p>
           <p className="text-2xl text-white font-medium"><span className="text-amber-400 font-black">{gameState.players[gameState.playerOrder[gameState.eastIndex]]?.name}</span> is East (東)!</p>
        </div>
      )}

      {/* 🚨 ZHA HU PENALTY SCREEN (UPGRADED) 🚨 */}
      {gameState?.status === 'zha_hu' && (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-red-950/80 p-8 rounded-[2.5rem] border border-red-500/50 w-full max-w-5xl text-center shadow-[0_0_100px_rgba(239,68,68,0.3)] text-white">
            <h1 className="text-6xl font-black text-red-500 mb-2 uppercase tracking-widest drop-shadow-lg">ZHA HU!</h1>
            <p className="text-xl text-red-200 mb-8">False Mahjong Declaration by <span className="font-bold text-white">{gameState.players[gameState.winnerId]?.name}</span></p>
            
            <div className="flex flex-col items-center gap-6 mb-10 w-full bg-black/40 p-6 rounded-3xl border border-red-500/30">
              {gameState.players[gameState.winnerId]?.melds?.length > 0 && (
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-red-300/70 uppercase tracking-widest mb-2">Exposed Melds</span>
                  <div className="flex gap-4 flex-wrap justify-center">
                    {gameState.players[gameState.winnerId].melds.map((meldObj, mIdx) => (
                      <div key={mIdx} className="flex gap-0.5 bg-red-900/20 p-1.5 rounded-xl shadow-lg border border-red-500/20">
                        {meldObj.tiles.map((t, tIdx) => <MahjongTile key={tIdx} tile={t} className="!w-10 !h-14 sm:!w-14 sm:!h-20 text-[14px] sm:text-[18px]" />)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-red-300/70 uppercase tracking-widest mb-2">Disputed Hand</span>
                <div className="flex gap-1 sm:gap-2 flex-wrap justify-center w-full">
                  {gameState.winningHand?.map((tile, i) => <MahjongTile key={i} tile={tile} className="!w-12 !h-16 sm:!w-16 sm:!h-24 text-[16px] sm:text-[20px]" />)}
                </div>
              </div>
            </div>

            {playerId === gameState.winnerId ? (
              <div className="space-y-6 max-w-md mx-auto">
                <p className="font-bold text-lg">You must pay the penalty!</p>
                <div>
                  <label className="block text-sm font-bold text-red-300 uppercase mb-3">Penalty amount PER PLAYER ($)</label>
                  <input type="number" min="0" value={zhaHuPenalty} onChange={(e) => setZhaHuPenalty(e.target.value)} className="w-full bg-red-900/50 border border-red-500/50 text-white p-4 rounded-xl outline-none font-black text-center text-3xl" />
                </div>
                <button onClick={handlePayZhaHu} className="w-full bg-red-600 hover:bg-red-500 text-white py-5 rounded-xl font-black uppercase tracking-widest shadow-lg transition-transform active:scale-95 text-lg">
                  Pay & Next Round
                </button>
              </div>
            ) : (
              <div className="py-6">
                <div className="animate-spin text-5xl mb-6">🚨</div>
                <p className="text-xl font-bold">Waiting for <span className="text-red-400">{gameState.players[gameState.winnerId]?.name}</span> to pay the penalty...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showHuModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 p-8 rounded-3xl border border-emerald-500/50 w-full max-w-md text-white shadow-[0_0_50px_rgba(16,185,129,0.2)]">
            <h2 className="text-3xl font-black mb-6 text-emerald-400 uppercase tracking-widest text-center">Declare Hu</h2>
            
            <div className="mb-6 flex flex-col items-center justify-center bg-black/40 p-4 rounded-xl border border-white/10">
              {gameState?.latestDiscard ? (
                <>
                  <p className="text-sm font-bold text-slate-400 uppercase mb-3">
                    Shooter: <span className="text-red-400">{gameState.players[gameState.latestDiscard.fromPlayerId]?.name}</span>
                  </p>
                  <MahjongTile tile={gameState.latestDiscard.tile} className="!w-12 !h-16 text-[16px] pointer-events-none" />
                </>
              ) : (
                <p className="text-lg font-bold text-amber-400 uppercase tracking-widest py-4">Zi Mo (Self Draw)</p>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-400 uppercase mb-3">Points (Tai)</label>
                <div className="flex gap-2 flex-wrap">
                  {Array.from({length: gameState.settings?.maxTai || 5}, (_, i) => i + 1).map(n => (
                    <button key={n} onClick={() => setHuTai(n)} className={`flex-1 min-w-[3rem] py-3 rounded-xl font-bold ${huTai === n ? 'bg-emerald-500 text-emerald-950' : 'bg-slate-800'}`}>
                      {n}{n === (gameState.settings?.maxTai || 5) && '+'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-4 mt-8">
                <button onClick={() => setShowHuModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 py-4 rounded-xl font-bold">Cancel</button>
                <button onClick={handleConfirmHu} className="flex-1 bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 py-4 rounded-xl font-black uppercase shadow-lg hover:scale-[1.02] transition-transform">Confirm Win</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState?.status === 'finished' && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="bg-black/40 p-8 sm:p-12 rounded-[2.5rem] border border-amber-500/50 shadow-[0_0_100px_rgba(245,158,11,0.2)] text-center flex flex-col items-center max-w-6xl w-full mx-4">
            <h1 className="text-6xl sm:text-7xl font-black text-amber-400 mb-2 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">HU!</h1>
            <p className="text-2xl sm:text-3xl text-white mb-2"><span className="text-emerald-400 font-bold">{gameState.winner}</span> won!</p>
            
            {gameState.winDetails && (
              <p className="text-amber-400 font-mono font-bold text-lg sm:text-xl mb-8 bg-amber-900/30 px-4 py-2 rounded-lg border border-amber-500/30">
                +{gameState.winDetails.amount} USD 
                <span className="text-xs sm:text-sm opacity-80 block mt-1 font-sans">
                  ({gameState.winDetails.tai} Tai {gameState.winDetails.isZiMo ? `Zi Mo + $${gameState.winDetails.ziMoBonus} Bonus` : 'Shooter'})
                </span>
              </p>
            )}

            <div className="flex flex-col items-center gap-6 mb-10 w-full">
              {gameState.players[gameState.winnerId]?.melds?.length > 0 && (
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Exposed Melds</span>
                  <div className="flex gap-4 flex-wrap justify-center">
                    {gameState.players[gameState.winnerId].melds.map((meldObj, mIdx) => (
                      <div key={mIdx} className="flex gap-0.5 bg-white/10 p-1.5 rounded-xl shadow-lg border border-white/20">
                        {meldObj.tiles.map((t, tIdx) => <MahjongTile key={tIdx} tile={t} className="!w-10 !h-14 sm:!w-14 sm:!h-20 text-[14px] sm:text-[18px]" />)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Concealed Winning Hand</span>
                <div className="flex gap-1 sm:gap-2 flex-wrap justify-center w-full bg-black/20 p-3 sm:p-4 rounded-2xl border border-white/5">
                  {gameState.winningHand?.map((tile, i) => <MahjongTile key={i} tile={tile} className="!w-12 !h-16 sm:!w-16 sm:!h-24 text-[16px] sm:text-[20px]" />)}
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-4 w-full max-w-lg mt-2 justify-center">
              {gameState.hostId === playerId ? (
                <button onClick={startGame} className="flex-1 bg-emerald-400 text-emerald-950 px-4 py-4 rounded-2xl font-black text-sm sm:text-lg uppercase shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:scale-105 transition-transform">Next Round</button>
              ) : (
                <div className="flex-1 p-4 bg-white/5 rounded-2xl flex items-center justify-center text-white/50 text-xs sm:text-sm font-bold uppercase">Waiting for host...</div>
              )}
              <button onClick={reportZhaHu} className="flex-1 bg-red-950/50 border border-red-500/50 text-red-400 hover:bg-red-600 hover:text-white px-4 py-4 rounded-2xl font-black text-sm sm:text-lg uppercase transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)]">🚨 ZHA HU REPORT</button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start text-white/90 z-20 pointer-events-none">
        <div className="bg-black/30 px-6 py-4 rounded-2xl backdrop-blur-xl pointer-events-auto border border-white/10 shadow-2xl flex items-center gap-6">
          <div><p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Room: {roomCode}</p><p className="font-mono text-xl sm:text-2xl font-black leading-none">Max Tai: {gameState?.settings?.maxTai}</p></div>
          <div className="h-10 w-px bg-white/20"></div>
          <div><p className="text-[10px] text-white/50 font-bold uppercase mb-1">My Balance</p><p className="font-mono text-2xl font-black text-emerald-400 leading-none">${myPlayer?.balance}</p></div>
        </div>
        <button onClick={() => { setInGame(false); setRoomCode(''); }} className="bg-red-500/10 text-red-400 px-5 py-3 rounded-xl font-bold pointer-events-auto border border-red-500/20 backdrop-blur-md">🚪 Leave</button>
      </div>

      <div className="flex-grow flex items-center justify-center pointer-events-none z-10 mt-10">
        <div className="w-[26rem] sm:w-[32rem] lg:w-[36rem] h-[26rem] sm:h-[32rem] lg:h-[36rem] bg-black/20 border border-white/5 rounded-full p-8 sm:p-12 relative flex flex-col items-center justify-center shadow-[inset_0_0_100px_rgba(0,0,0,0.5)] backdrop-blur-sm">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center -mt-8 sm:-mt-12">
            <p className="text-emerald-500/50 font-black tracking-[0.4em] text-xs mb-2">TILES LEFT</p>
            <p className="text-6xl sm:text-7xl font-mono text-white/80 font-black drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{gameState?.deck.length || 0}</p>
          </div>
          
          {gameState?.latestDiscard && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-16 sm:mt-20 animate-[bounce_1s_infinite] rounded-xl pointer-events-auto z-[100]">
              <MahjongTile tile={gameState.latestDiscard.tile} className="!w-12 !h-16 sm:!w-16 sm:!h-24 text-[16px] sm:text-[20px] border-[3px] border-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.8)]" />
            </div>
          )}

          <div className="w-full h-full flex flex-wrap justify-center items-center align-middle gap-1.5 opacity-90 pt-32">
            {gameState?.discards?.slice(-20).map((tile, i) => (
              <MahjongTile key={i} tile={tile} className="!w-8 !h-12 sm:!w-10 sm:!h-14 lg:!w-12 lg:!h-16 text-[12px] sm:text-[14px] shadow-md opacity-70" />
            ))}
          </div>
        </div>
      </div>

      {topPlayerId && gameState.players[topPlayerId] && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
          <div className="flex gap-4">
             {gameState.players[topPlayerId].melds?.map((meldObj, mIdx) => (
                <div key={mIdx} className="flex gap-0.5 bg-black/40 p-1.5 rounded-xl border border-white/10 shadow-lg">
                  {meldObj.tiles.map((t, tIdx) => <MahjongTile key={tIdx} tile={t} className="!w-8 !h-12 text-[12px]" />)}
                </div>
             ))}
          </div>
          <div className="flex gap-0.5">{[...Array(gameState.players[topPlayerId].hand?.length || 13)].map((_, i) => <MahjongTile key={i} isHidden={true} className="!w-8 !h-12 sm:!w-10 sm:!h-14 border-emerald-900/50" />)}</div>
          <div className={`px-5 py-2 rounded-2xl flex flex-col items-center gap-0.5 border backdrop-blur-md ${currentTurnPlayerId === topPlayerId ? 'bg-emerald-500/20 border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.3)]' : 'bg-black/40 border-white/10'}`}>
            <span className="text-xs font-black uppercase tracking-widest text-white/70 flex items-center gap-2">
              <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[10px]">{getPlayerWind(topPlayerId)}</span>
              {gameState.players[topPlayerId].name}
            </span>
          </div>
        </div>
      )}

      {leftPlayerId && gameState.players[leftPlayerId] && (
        <div className="absolute left-4 sm:left-10 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3">
          <div className={`px-5 py-2 rounded-2xl flex flex-col items-center gap-0.5 border backdrop-blur-md ${currentTurnPlayerId === leftPlayerId ? 'bg-emerald-500/20 border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.3)]' : 'bg-black/40 border-white/10'}`}>
            <span className="text-xs font-black uppercase tracking-widest text-white/70 flex items-center gap-2">
              <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[10px]">{getPlayerWind(leftPlayerId)}</span>
              {gameState.players[leftPlayerId].name}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">{[...Array(gameState.players[leftPlayerId].hand?.length || 13)].map((_, i) => <MahjongTile key={i} isHidden={true} className="!w-10 !h-6 sm:!w-14 sm:!h-8 border-emerald-900/50" />)}</div>
          <div className="flex flex-col gap-4">
             {gameState.players[leftPlayerId].melds?.map((meldObj, mIdx) => (
                <div key={mIdx} className="flex gap-0.5 bg-black/40 p-1.5 rounded-xl border border-white/10 shadow-lg">
                  {meldObj.tiles.map((t, tIdx) => <MahjongTile key={tIdx} tile={t} className="!w-8 !h-12 text-[12px]" />)}
                </div>
             ))}
          </div>
        </div>
      )}

      {rightPlayerId && gameState.players[rightPlayerId] && (
        <div className="absolute right-4 sm:right-10 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3">
          <div className={`px-5 py-2 rounded-2xl flex flex-col items-center gap-0.5 border backdrop-blur-md ${currentTurnPlayerId === rightPlayerId ? 'bg-emerald-500/20 border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.3)]' : 'bg-black/40 border-white/10'}`}>
            <span className="text-xs font-black uppercase tracking-widest text-white/70 flex items-center gap-2">
              <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[10px]">{getPlayerWind(rightPlayerId)}</span>
              {gameState.players[rightPlayerId].name}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">{[...Array(gameState.players[rightPlayerId].hand?.length || 13)].map((_, i) => <MahjongTile key={i} isHidden={true} className="!w-10 !h-6 sm:!w-14 sm:!h-8 border-emerald-900/50" />)}</div>
          <div className="flex flex-col gap-4">
             {gameState.players[rightPlayerId].melds?.map((meldObj, mIdx) => (
                <div key={mIdx} className="flex gap-0.5 bg-black/40 p-1.5 rounded-xl border border-white/10 shadow-lg">
                  {meldObj.tiles.map((t, tIdx) => <MahjongTile key={tIdx} tile={t} className="!w-8 !h-12 text-[12px]" />)}
                </div>
             ))}
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 w-full pt-20 pb-8 sm:pt-32 sm:pb-12 px-4 sm:px-10 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col items-center z-30 pointer-events-none">
        
        <div className="flex flex-wrap gap-4 sm:gap-8 mb-4 sm:mb-6 w-full max-w-7xl justify-start pointer-events-auto">
          {myPlayer?.melds?.map((meldObj, mIdx) => (
            <div key={`m-${mIdx}`} className="flex gap-0.5 bg-black/40 p-1.5 sm:p-2 rounded-2xl border border-white/10 shadow-xl">
              {meldObj.tiles.map((t, tIdx) => <MahjongTile key={tIdx} tile={t} className="!w-10 !h-14 sm:!w-12 sm:!h-16 text-[14px] sm:text-[16px]" />)}
            </div>
          ))}
          {myPlayer?.flowers?.length > 0 && (
            <div className="flex flex-wrap gap-1 bg-black/20 p-1.5 sm:p-2 rounded-2xl border border-white/5">
              {myPlayer.flowers.map((tile, i) => <MahjongTile key={i} tile={tile} className="!w-8 !h-12 sm:!w-10 !h-14 text-[12px] sm:text-[14px] opacity-90" />)}
            </div>
          )}
        </div>

        <div className="flex justify-between items-end w-full max-w-7xl mb-8 pointer-events-auto">
          <div className={`px-4 sm:px-6 py-2 sm:py-3 rounded-2xl font-black uppercase tracking-widest border transition-colors flex items-center gap-2 sm:gap-3 backdrop-blur-md ${isMyTurn ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.3)]' : 'bg-black/60 border-white/10 text-white/50'}`}>
            <span className="bg-emerald-600 text-white px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-xs">{getPlayerWind(playerId)}</span> 
            <span className="text-lg sm:text-xl">{myPlayer?.name}</span>
            {isMyTurn && <span className="bg-emerald-500 text-emerald-950 px-2 py-0.5 rounded text-[10px] sm:text-xs ml-2 hidden sm:inline">YOUR TURN</span>}
          </div>
          
          <div className="flex gap-2 sm:gap-4 items-center">
            {isInterruptWindow && !meldMode ? (
               <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3 bg-indigo-900/80 p-2 rounded-2xl border border-indigo-400/50 backdrop-blur-md animate-[pulse_2s_infinite]">
                 {isNextTurnMe && <button onClick={() => startMeldSelection('chow')} className="bg-blue-600 hover:bg-blue-500 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-widest shadow-lg text-sm sm:text-base">Chow</button>}
                 <button onClick={() => startMeldSelection('pong')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-widest shadow-lg text-sm sm:text-base">Pong</button>
                 <button onClick={() => startMeldSelection('kong')} className="bg-purple-600 hover:bg-purple-500 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-widest shadow-lg text-sm sm:text-base">Kong</button>
                 <button onClick={() => { setHuShooterId(gameState.latestDiscard.fromPlayerId); setHuType('shooter'); setShowHuModal(true); }} className="bg-amber-500 hover:bg-amber-400 text-amber-950 px-6 sm:px-8 py-2 sm:py-3 rounded-xl font-black text-lg sm:text-xl uppercase tracking-widest shadow-[0_0_20px_rgba(245,158,11,0.5)]">HU!</button>
                 <button onClick={handleSkipInterrupt} className="bg-slate-700 hover:bg-slate-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-widest shadow-lg border border-slate-500/50 text-sm sm:text-base">Skip ({timeLeft}s)</button>
               </div>
            ) : meldMode ? (
               <div className="flex items-center gap-2 sm:gap-4 bg-emerald-900/90 p-2 rounded-2xl border border-emerald-400/50 backdrop-blur-md px-4 sm:px-6">
                 <span className="text-emerald-300 font-bold uppercase tracking-widest text-xs sm:text-sm">Select {meldMode === 'self_kong' ? 4 : meldMode === 'kong' ? 3 : 2}</span>
                 <div className="flex gap-2">
                   <button onClick={cancelMeldSelection} className="bg-slate-700 hover:bg-slate-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-widest text-sm sm:text-base">Cancel</button>
                   <button onClick={confirmMeld} disabled={selectedForMeld.length !== (meldMode === 'self_kong' ? 4 : meldMode==='kong'?3:2)} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:bg-slate-500 text-emerald-950 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-black uppercase tracking-widest text-sm sm:text-base">Confirm</button>
                 </div>
               </div>
            ) : (
              <>
                <button onClick={() => { if (!canDiscard) alert("You need 14 total tiles to declare Hu!"); else { setHuType('zimo'); setShowHuModal(true); } }} className="bg-amber-500 hover:bg-amber-400 text-amber-950 px-8 sm:px-14 py-3 sm:py-5 rounded-2xl font-black text-xl sm:text-2xl shadow-[0_0_30px_rgba(245,158,11,0.4)] active:scale-95 uppercase tracking-[0.2em]">HU!</button>
                
                {isMyTurn && canDiscard && (
                  <button onClick={() => startMeldSelection('self_kong')} className="bg-purple-600 hover:bg-purple-500 text-white px-4 sm:px-8 py-3 sm:py-5 rounded-2xl font-black shadow-xl active:scale-95 uppercase tracking-widest text-sm sm:text-lg">Kong</button>
                )}

                <div className="flex flex-col items-center relative">
                   <button onClick={drawTile} disabled={!isMyTurn || canDiscard || gameState?.latestDiscard} className="bg-white hover:bg-slate-200 disabled:bg-white/10 disabled:text-white/30 text-slate-900 px-6 sm:px-10 py-3 sm:py-5 rounded-2xl font-black shadow-xl active:scale-95 uppercase tracking-widest text-sm sm:text-lg w-full">Draw</button>
                   {isMyTurn && gameState?.latestDiscard && <span className="text-amber-400/80 text-[10px] sm:text-xs font-bold mt-2 uppercase tracking-widest animate-pulse absolute -bottom-6 whitespace-nowrap">Waiting...</span>}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-end justify-center gap-1 sm:gap-2 w-full max-w-[90rem] pointer-events-auto">
          {myPlayer?.hand?.map((tile, i) => (
            <MahjongTile 
              key={tile.id || i} tile={tile} isHand={true} isSelected={selectedForMeld.includes(i)}
              className={`!w-[2.5rem] !h-[3.8rem] sm:!w-[4rem] sm:!h-[6rem] lg:!w-[5.5rem] lg:!h-[8rem] text-[16px] sm:text-[26px] lg:text-[36px] ${isMyTurn && canDiscard && !meldMode ? 'cursor-pointer' : meldMode ? 'cursor-pointer' : 'cursor-default'}`}
              onClick={() => { 
                if (meldMode) {
                  if (selectedForMeld.includes(i)) setSelectedForMeld(selectedForMeld.filter(idx => idx !== i));
                  else if (selectedForMeld.length < (meldMode === 'self_kong' ? 4 : meldMode === 'kong' ? 3 : 2)) setSelectedForMeld([...selectedForMeld, i]);
                } else if (isMyTurn && canDiscard && !isInterruptWindow) discardTile(i); 
              }} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}