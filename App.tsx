import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Trophy, 
  Users, 
  Calendar, 
  LayoutGrid, 
  PlusCircle, 
  Table as TableIcon,
  Trash2,
  Save,
  Play,
  ArrowLeft,
  History,
  CheckCircle2,
  Trophy as TrophyIcon,
  Hash,
  Percent,
  X,
  AlertTriangle,
  Edit2,
  BarChart3,
  Share2,
  ChevronUp,
  ChevronDown,
  Clock,
  RotateCcw,
  Image as ImageIcon,
  Camera,
  RefreshCw,
  Search,
  Plus,
  Upload,
  Zap,
  MapPin,
  Settings2,
  GitMerge,
  Divide,
  Printer,
  UserPlus,
  UserMinus,
  Medal,
  Target,
  Flame
} from 'lucide-react';
import { Tournament, Team, Match, ViewState, TournamentFormat, Stage, TieBreakRule, KnockoutLogic, Player } from './types';
import { suggestTeamNames } from './services/gemini';

// --- Types for persistence ---
interface SavedTeam {
  name: string;
  logoUrl: string;
  players?: Player[];
}

// --- Constants & Assets ---
const TEAM_LOGOS = ['⚽', '🏆', '🦁', '🦅', '⚡', '🔥', '🛡️', '🌟', '💎', '🎯', '🚀', '⚓', '🐺', '', '🌪️', '⚔️'];

const TIE_BREAK_OPTIONS: { value: TieBreakRule; label: string }[] = [
  { value: 'WINS', label: 'Vitórias' },
  { value: 'GOAL_DIFF', label: 'Saldo de Gols' },
  { value: 'PERCENTAGE', label: '% Aproveitamento' },
  { value: 'HEAD_TO_HEAD', label: 'Confronto Direto (Pts)' },
  { value: 'GOALS_FOR', label: 'Gols Pró' },
  { value: 'H2H_GOAL_DIFF', label: 'Saldo no Confronto Direto' },
  { value: 'H2H_GOALS_FOR', label: 'Gols Pró no Conf. Direto' },
  { value: 'AWAY_GOALS', label: 'Gols Fora de Casa' },
];

const STAGE_LABELS: Record<Stage, string> = {
  'LEAGUE': 'Liga',
  'GROUP': 'Grupos',
  'ROUND_16': 'Oitavas de Final',
  'QUARTER_FINAL': 'Quartas de Final',
  'SEMI_FINAL': 'Semifinal',
  'THIRD_PLACE': 'Disputa de 3º Lugar',
  'FINAL': 'Grande Final'
};

// --- Components ---

const TeamLogo: React.FC<{ logo?: string; className?: string }> = ({ logo, className = "w-8 h-8 text-lg" }) => {
  if (logo?.startsWith('data:image')) {
    return <img src={logo} alt="Logo" className={`${className} object-cover rounded-lg`} />;
  }
  return <span className={`${className} flex items-center justify-center`}>{logo || '⚽'}</span>;
};

// --- Utils ---

function sortTeams(teams: Team[], rules: TieBreakRule[], matches: Match[]): Team[] {
  const compareTeams = (teamA: Team, teamB: Team, remainingRules: TieBreakRule[]): number => {
    if (remainingRules.length === 0) return teamA.name.localeCompare(teamB.name);

    const rule = remainingRules[0];
    const nextRules = remainingRules.slice(1);

    let valA = 0;
    let valB = 0;

    switch (rule) {
      case 'POINTS':
        valA = teamA.points;
        valB = teamB.points;
        break;
      case 'WINS':
        valA = teamA.won;
        valB = teamB.won;
        break;
      case 'GOAL_DIFF':
        valA = teamA.goalsFor - teamA.goalsAgainst;
        valB = teamB.goalsFor - teamB.goalsAgainst;
        break;
      case 'GOALS_FOR':
        valA = teamA.goalsFor;
        valB = teamA.goalsFor;
        break;
      case 'PERCENTAGE':
        valA = teamA.played > 0 ? (teamA.points / (teamA.played * 3)) : 0;
        valB = teamB.played > 0 ? (teamB.points / (teamB.played * 3)) : 0;
        break;
      case 'AWAY_GOALS':
        valA = matches.filter(m => m.isFinished && m.awayTeamId === teamA.id).reduce((acc, m) => acc + (m.awayScore || 0), 0);
        valB = matches.filter(m => m.isFinished && m.awayTeamId === teamB.id).reduce((acc, m) => acc + (m.awayScore || 0), 0);
        break;
      case 'HEAD_TO_HEAD':
      case 'H2H_GOAL_DIFF':
      case 'H2H_GOALS_FOR':
        const h2hMatches = matches.filter(m => 
          m.isFinished && 
          ((m.homeTeamId === teamA.id && m.awayTeamId === teamB.id) || 
           (m.homeTeamId === teamB.id && m.awayTeamId === teamA.id))
        );
        
        if (rule === 'HEAD_TO_HEAD') {
          h2hMatches.forEach(m => {
            const isAHome = m.homeTeamId === teamA.id;
            if (m.homeScore! === m.awayScore!) { valA += 1; valB += 1; }
            else if (isAHome ? (m.homeScore! > m.awayScore!) : (m.awayScore! > m.homeScore!)) valA += 3;
            else valB += 3;
          });
        } else if (rule === 'H2H_GOAL_DIFF') {
          h2hMatches.forEach(m => {
            const isAHome = m.homeTeamId === teamA.id;
            valA += isAHome ? (m.homeScore! - m.awayScore!) : (m.awayScore! - m.homeScore!);
            valB += isAHome ? (m.awayScore! - m.homeScore!) : (m.homeScore! - m.awayScore!);
          });
        } else if (rule === 'H2H_GOALS_FOR') {
          h2hMatches.forEach(m => {
            valA += (m.homeTeamId === teamA.id ? m.homeScore! : m.awayScore!);
            valB += (m.homeTeamId === teamB.id ? m.homeScore! : m.awayScore!);
          });
        }
        break;
    }

    if (valB !== valA) return valB - valA;
    return compareTeams(teamA, teamB, nextRules);
  };

  const fullRules: TieBreakRule[] = rules.includes('POINTS') ? rules : ['POINTS' as TieBreakRule, ...rules];
  return [...teams].sort((a, b) => compareTeams(a, b, fullRules));
}

function generateLeagueSchedule(teams: Team[], maxTables: number, stage: Stage = 'LEAGUE'): Match[] {
  const matches: Match[] = [];
  const teamIds = teams.map(t => t.id);
  if (teamIds.length % 2 !== 0) teamIds.push('BYE');
  const n = teamIds.length;
  const rounds = n - 1;
  const half = n / 2;
  const tempIds = [...teamIds];

  for (let r = 0; r < rounds; r++) {
    let roundTable = 1; 
    for (let i = 0; i < half; i++) {
      const home = tempIds[i];
      const away = tempIds[n - 1 - i];
      if (home !== 'BYE' && away !== 'BYE') {
        matches.push({
          id: Math.random().toString(36).substr(2, 9),
          homeTeamId: home, awayTeamId: away, round: r + 1, tableNumber: roundTable, isFinished: false, stage
        });
        roundTable = roundTable >= maxTables ? 1 : roundTable + 1;
      }
    }
    tempIds.splice(1, 0, tempIds.pop()!);
  }
  return matches;
}

function determineAdvantageTeam(teamAId: string, teamBId: string, teams: Team[], rules: TieBreakRule[], matches: Match[]): string | undefined {
  if (teamAId === 'TBD' || teamBId === 'TBD') return undefined;
  
  const teamA = teams.find(t => t.id === teamAId);
  const teamB = teams.find(t => t.id === teamBId);
  
  if (!teamA || !teamB) return undefined;

  const groupMatches = matches.filter(m => m.stage === 'GROUP' && m.isFinished);
  
  const getGroupStats = (teamId: string) => {
    let s = { points: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
    groupMatches.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId).forEach(m => {
      s.played++;
      const isHome = m.homeTeamId === teamId;
      const h = m.homeScore!, a = m.awayScore!;
      if (isHome) { 
        s.goalsFor += h; s.goalsAgainst += a; 
        if (h > a) { s.won++; s.points += 3; } else if (h === a) { s.drawn++; s.points++; } else s.lost++; 
      } else { 
        s.goalsFor += a; s.goalsAgainst += h; 
        if (a > h) { s.won++; s.points += 3; } else if (a === h) { s.drawn++; s.points++; } else s.lost++; 
      }
    });
    return s;
  };

  const teamAGroup = { ...teamA, ...getGroupStats(teamAId) };
  const teamBGroup = { ...teamB, ...getGroupStats(teamBId) };

  if (teamA.groupPos !== undefined && teamB.groupPos !== undefined) {
    if (teamA.groupPos < teamB.groupPos) return teamAId;
    if (teamB.groupPos < teamA.groupPos) return teamBId;
  }

  const sorted = sortTeams([teamAGroup, teamBGroup], rules, groupMatches);
  if (sorted[0].id !== sorted[1].id) return sorted[0].id;

  return undefined;
}

function generateKnockoutMatches(teamIds: string[], stage: Stage, round: number, maxTables: number, startTable: number, tournament?: Tournament): Match[] {
  const matches: Match[] = [];
  let currentTable = startTable;
  for (let i = 0; i < teamIds.length; i += 2) {
    const hId = teamIds[i] || 'TBD';
    const aId = teamIds[i + 1] || 'TBD';
    
    let advantageTeamId: string | undefined = undefined;
    if (tournament && tournament.useKnockoutAdvantage && hId !== 'TBD' && aId !== 'TBD') {
      advantageTeamId = determineAdvantageTeam(hId, aId, tournament.teams, tournament.tieBreakRules, tournament.matches);
    }

    matches.push({
      id: Math.random().toString(36).substr(2, 9),
      homeTeamId: hId,
      awayTeamId: aId,
      round, tableNumber: currentTable, isFinished: false, stage,
      advantageTeamId
    });
    currentTable = currentTable >= maxTables ? 1 : currentTable + 1;
  }
  return matches;
}

const CameraModal: React.FC<{ isOpen: boolean; onClose: () => void; onCapture: (data: string) => void }> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(s => {
          setStream(s);
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(err => console.error("Erro ao acessar câmera:", err));
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const size = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          video, 
          (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 
          0, 0, 200, 200
        );
        onCapture(canvas.toDataURL('image/png'));
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b flex justify-between items-center">
          <h3 className="font-black text-slate-800">Capturar Foto</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
        </div>
        <div className="relative aspect-square bg-black overflow-hidden">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover mirror" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 border-4 border-white/20 pointer-events-none flex items-center justify-center">
             <div className="w-48 h-48 border-2 border-dashed border-white/50 rounded-full"></div>
          </div>
        </div>
        <div className="p-8 flex justify-center">
          <button onClick={capture} className="w-20 h-20 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all">
            <div className="w-16 h-16 border-4 border-white/30 rounded-full flex items-center justify-center">
              <Camera size={32} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

const TeamEditModal: React.FC<{ 
  team: Team | null; 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (id: string, name: string, logo: string, players: Player[]) => void;
  onCameraOpen: () => void;
  onFileUpload: () => void;
}> = ({ team, isOpen, onClose, onSave, onCameraOpen, onFileUpload }) => {
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [playerNumber, setPlayerNumber] = useState('');

  useEffect(() => {
    if (team) {
      setName(team.name);
      setLogo(team.logoUrl || TEAM_LOGOS[0]);
      setPlayers(team.players || []);
    }
  }, [team, isOpen]);

  const addPlayer = () => {
    if (players.length >= 15) {
      alert("Limite de 15 jogadores atingido.");
      return;
    }
    if (!playerName || !playerNumber) return;
    const num = parseInt(playerNumber);
    if (players.some(p => p.number === num)) {
      alert("Este número já está em uso.");
      return;
    }
    const newPlayer: Player = {
      id: Math.random().toString(36).substr(2, 9),
      name: playerName,
      number: num
    };
    setPlayers([...players, newPlayer]);
    setPlayerName('');
    setPlayerNumber('');
  };

  const removePlayer = (pid: string) => {
    setPlayers(players.filter(p => p.id !== pid));
  };

  if (!isOpen || !team) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border my-8">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-black text-slate-800 flex items-center gap-2"><Edit2 size={18} /> Editar Equipe</h3>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors border border-transparent hover:border-slate-200"><X size={20}/></button>
        </div>
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="flex justify-center mb-6 relative">
              <div className="w-32 h-32 bg-slate-50 rounded-[2rem] flex items-center justify-center border-2 border-dashed border-slate-300 group overflow-hidden">
                <TeamLogo logo={logo} className="w-full h-full text-5xl" />
                <div className="absolute bottom-0 right-0 flex gap-1 p-2">
                  <button 
                    onClick={onCameraOpen}
                    className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg hover:scale-110 transition-transform active:scale-95"
                  >
                    <Camera size={20} />
                  </button>
                  <button 
                    onClick={onFileUpload}
                    className="p-3 bg-slate-700 text-white rounded-2xl shadow-lg hover:scale-110 transition-transform active:scale-95"
                  >
                    <Upload size={20} />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Nome da Equipe</label>
                <input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" 
                  placeholder="Ex: Galáticos FC" 
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 block">Emoji (Alternativo)</label>
                  <button onClick={() => setLogo(TEAM_LOGOS[Math.floor(Math.random()*TEAM_LOGOS.length)])} className="text-[10px] text-emerald-600 font-black"><RefreshCw size={10} className="inline mr-1" /> ALEATÓRIO</button>
                </div>
                <div className="grid grid-cols-4 gap-2 h-24 overflow-y-auto pr-2 custom-scrollbar">
                  {TEAM_LOGOS.map(emoji => (
                    <button 
                      key={emoji} 
                      onClick={() => setLogo(emoji)} 
                      className={`w-full aspect-square text-2xl flex items-center justify-center rounded-xl transition-all ${logo === emoji ? 'bg-emerald-600 text-white scale-110 shadow-lg' : 'bg-slate-50 border hover:bg-slate-100'}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-[2rem] border space-y-4">
             <div className="flex justify-between items-center">
                <h4 className="font-black text-slate-800 text-sm uppercase flex items-center gap-2"><Users size={16} className="text-emerald-600"/> Elenco ({players.length}/15)</h4>
             </div>

             <div className="flex gap-2">
                <input 
                  value={playerNumber}
                  type="number"
                  onChange={(e) => setPlayerNumber(e.target.value)}
                  className="w-16 p-3 bg-white border rounded-xl text-center font-bold text-xs"
                  placeholder="Nº"
                />
                <input 
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="flex-1 p-3 bg-white border rounded-xl text-xs"
                  placeholder="Nome do Jogador"
                />
                <button 
                  onClick={addPlayer}
                  className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
                >
                  <UserPlus size={18} />
                </button>
             </div>

             <div className="h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar no-scrollbar">
                {players.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-white border rounded-xl shadow-sm group/p">
                    <span className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center font-black text-[10px]">{p.number}</span>
                    <span className="flex-1 text-xs font-bold text-slate-700 truncate">{p.name}</span>
                    <button onClick={() => removePlayer(p.id)} className="opacity-0 group-hover/p:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"><UserMinus size={14}/></button>
                  </div>
                ))}
                {players.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 text-[10px] font-bold py-12">
                    <Users size={32} className="opacity-20 mb-2"/>
                    Nenhum jogador adicionado
                  </div>
                )}
             </div>
          </div>
        </div>
        <div className="p-6 bg-slate-50 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 bg-white border font-bold rounded-2xl text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button onClick={() => onSave(team.id, name, logo, players)} className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:bg-emerald-700 transition-all">Salvar Alterações</button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState(ViewState.DASHBOARD);
  const [loading, setLoading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<TournamentFormat>('LEAGUE');
  const [tieBreakRules, setTieBreakRules] = useState<TieBreakRule[]>(['WINS', 'GOAL_DIFF', 'PERCENTAGE']);
  const [useKnockoutAdvantage, setUseKnockoutAdvantage] = useState(false);
  const [knockoutLogic, setKnockoutLogic] = useState<KnockoutLogic>('OLYMPIC');
  
  // Team Edit states
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLogo, setNewTeamLogo] = useState(TEAM_LOGOS[0]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [teamToQuickEdit, setTeamToQuickEdit] = useState<Team | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedTournaments = localStorage.getItem('arena_pro_v5');
    if (savedTournaments) {
      try {
        const parsed = JSON.parse(savedTournaments);
        if (Array.isArray(parsed)) setTournaments(parsed);
      } catch (e) { console.error(e); }
    }

    const savedPool = localStorage.getItem('arena_pro_team_pool');
    if (savedPool) {
      try {
        const parsed = JSON.parse(savedPool);
        if (Array.isArray(parsed)) setSavedTeams(parsed);
      } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('arena_pro_v5', JSON.stringify(tournaments));
  }, [tournaments]);

  useEffect(() => {
    localStorage.setItem('arena_pro_team_pool', JSON.stringify(savedTeams));
  }, [savedTeams]);

  const activeTournament = useMemo(() => tournaments.find(t => t.id === activeId) || null, [tournaments, activeId]);

  const updateActiveTournament = (updated: Tournament) => {
    setTournaments(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const resolveTeam = (id: string) => {
    if (id === 'TBD') return { id: 'TBD', name: 'A definir', logo: '?' };
    if (id === 'BYE') return { id: 'BYE', name: 'Folga', logo: '💤' };
    const t = activeTournament?.teams.find(t => t.id === id);
    return t ? { id: t.id, name: t.name, logo: t.logoUrl, original: t } : { id, name: id, logo: '⚽' };
  };

  const handleCreateTournament = async (name: string, maxTables: number, format: TournamentFormat, locationLabel: string, numGroups?: number, advanceCount?: number) => {
    setLoading(true);
    const newTournament: Tournament = {
      id: Date.now().toString(),
      name, format, teams: [], matches: [], maxTables, locationLabel: locationLabel || 'Mesa', createdAt: Date.now(), isFinished: false, slogan: "", numGroups,
      advanceCountPerGroup: advanceCount,
      tieBreakRules: [...tieBreakRules],
      useKnockoutAdvantage,
      knockoutLogic
    };
    setTournaments(prev => [...prev, newTournament]);
    setActiveId(newTournament.id);
    setView(ViewState.TEAMS);
    setLoading(false);
  };

  const addTeam = (name: string, logo: string = TEAM_LOGOS[Math.floor(Math.random() * TEAM_LOGOS.length)], players: Player[] = []) => {
    if (!activeTournament) return;
    
    if (activeTournament.teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        alert("Já existe uma equipe com este nome neste torneio.");
        return;
    }

    const teamId = Math.random().toString(36).substr(2, 9);
    updateActiveTournament({
      ...activeTournament,
      teams: [...activeTournament.teams, { 
        id: teamId, 
        name, 
        logoUrl: logo,
        points: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0,
        players
      }]
    });

    setSavedTeams(prev => {
      const existingIdx = prev.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx] = { name, logoUrl: logo, players };
        return updated;
      }
      return [{ name, logoUrl: logo, players }, ...prev].slice(0, 100);
    });
  };

  const saveTeamEdit = () => {
    if (!activeTournament || !editingTeam) return;

    if (activeTournament.teams.some(t => t.id !== editingTeam.id && t.name.toLowerCase() === newTeamName.toLowerCase())) {
        alert("Já existe uma equipe com este nome neste torneio.");
        return;
    }

    updateActiveTournament({
      ...activeTournament,
      teams: activeTournament.teams.map(t => t.id === editingTeam.id ? { ...t, name: newTeamName, logoUrl: newTeamLogo } : t)
    });

    setSavedTeams(prev => {
      const existingIdx = prev.findIndex(t => t.name.toLowerCase() === editingTeam.name.toLowerCase());
      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], name: newTeamName, logoUrl: newTeamLogo };
        return updated;
      }
      return prev;
    });

    setEditingTeam(null);
    setNewTeamName('');
    setNewTeamLogo(TEAM_LOGOS[0]);
  };

  const handleQuickEditSave = (id: string, name: string, logo: string, players: Player[]) => {
    const isFromHistoryPool = !activeTournament?.teams.some(t => t.id === id);
    
    if (isFromHistoryPool) {
      setSavedTeams(prev => prev.map(t => t.name === name ? { ...t, logoUrl: logo, players } : t));
      setIsQuickEditOpen(false);
      setTeamToQuickEdit(null);
      return;
    }

    if (!activeTournament) return;
    updateActiveTournament({
      ...activeTournament,
      teams: activeTournament.teams.map(t => t.id === id ? { ...t, name, logoUrl: logo, players } : t)
    });
    
    setSavedTeams(prev => {
      const exists = prev.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
      if (exists !== -1) {
         const updated = [...prev];
         updated[exists] = { ...updated[exists], logoUrl: logo, players };
         return updated;
      }
      return prev;
    });

    setIsQuickEditOpen(false);
    setTeamToQuickEdit(null);
  };

  const startTournament = () => {
    if (!activeTournament || activeTournament.teams.length < 2) return;
    let matches: Match[] = [];
    let updatedTeams = [...activeTournament.teams];

    if (activeTournament.format === 'LEAGUE') {
      matches = generateLeagueSchedule(updatedTeams, activeTournament.maxTables);
    } else if (activeTournament.format === 'KNOCKOUT') {
      let stage: Stage = updatedTeams.length > 8 ? 'ROUND_16' : (updatedTeams.length > 4 ? 'QUARTER_FINAL' : (updatedTeams.length > 2 ? 'SEMI_FINAL' : 'FINAL'));
      matches = generateKnockoutMatches(updatedTeams.map(t => t.id), stage, 1, activeTournament.maxTables, 1, activeTournament);
    } else if (activeTournament.format === 'GROUPS_KNOCKOUT') {
      const gCount = activeTournament.numGroups || 2;
      const shuffled = [...updatedTeams].sort(() => Math.random() - 0.5);
      updatedTeams = shuffled.map((t, i) => ({ ...t, group: String.fromCharCode(65 + (i % gCount)) }));
      for (let i = 0; i < gCount; i++) {
        const groupId = String.fromCharCode(65 + i);
        const gTeams = updatedTeams.filter(t => t.group === groupId);
        matches.push(...generateLeagueSchedule(gTeams, activeTournament.maxTables, 'GROUP').map(m => ({ ...m, groupId })));
      }
    }
    
    const roundCounters: Record<number, number> = {};
    const matchesWithUniqueTables = matches.map(m => {
      const r = m.round;
      const current = roundCounters[r] || 1;
      const tNum = current;
      roundCounters[r] = tNum >= activeTournament.maxTables ? 1 : tNum + 1;
      return { ...m, tableNumber: tNum };
    });

    updateActiveTournament({ ...activeTournament, matches: matchesWithUniqueTables, teams: updatedTeams });
    setView(ViewState.MATCHES);
  };

  const updateMatchScore = (matchId: string, hS: number, aS: number) => {
    if (!activeTournament) return;
    const wasAlreadyFinished = activeTournament.matches.find(m => m.id === matchId)?.isFinished;
    const updatedMatches: Match[] = activeTournament.matches.map((m: Match) => m.id === matchId ? { ...m, homeScore: hS, awayScore: aS, isFinished: true } : m);
    
    const updatedTeams = activeTournament.teams.map(team => {
      let s = { points: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
      updatedMatches.filter(m => m.isFinished && (m.homeTeamId === team.id || m.awayTeamId === team.id)).forEach(m => {
        s.played++;
        const isHome = m.homeTeamId === team.id;
        const h = m.homeScore!, a = m.awayScore!;
        if (isHome) { s.goalsFor += h; s.goalsAgainst += a; if (h > a) { s.won++; s.points += 3; } else if (h === a) { s.drawn++; s.points++; } else s.lost++; }
        else { s.goalsFor += a; s.goalsAgainst += h; if (a > h) { s.won++; s.points += 3; } else if (a === h) { s.drawn++; s.points++; } else s.lost++; }
      });
      return { ...team, ...s };
    });

    const match = updatedMatches.find(m => m.id === matchId)!;
    const stageMatches: Match[] = updatedMatches.filter((m: Match) => m.stage === match.stage);
    const stageFinished = stageMatches.every((m: Match) => m.isFinished);

    if (match.stage === 'LEAGUE' && stageFinished && !wasAlreadyFinished) {
      updateActiveTournament({ ...activeTournament, matches: updatedMatches, teams: updatedTeams, isFinished: true });
      setView(ViewState.FINAL_RANKING);
      return;
    }

    let nextMatches: Match[] = [];
    if (stageFinished && match.stage !== 'LEAGUE' && !wasAlreadyFinished) {
      if (match.stage === 'GROUP') {
        const groups = Array.from(new Set(updatedTeams.map(t => t.group))).filter((gid): gid is string => Boolean(gid)).sort();
        const countToAdvance = activeTournament.advanceCountPerGroup || 2;
        const teamsWithPos = [...updatedTeams];
        const advancedTeamsByGroup: Record<string, Team[]> = {};

        groups.forEach(gid => {
          const sorted = sortTeams(updatedTeams.filter(t => t.group === gid), activeTournament.tieBreakRules, updatedMatches);
          sorted.forEach((team, idx) => {
            const teamIdx = teamsWithPos.findIndex(t => t.id === team.id);
            if (teamIdx !== -1) teamsWithPos[teamIdx].groupPos = idx + 1;
          });
          advancedTeamsByGroup[gid] = sorted.slice(0, countToAdvance);
        });

        const allAdvancedTeams = Object.values(advancedTeamsByGroup).flat();
        let teamOrderForKnockout: string[] = [];

        if (activeTournament.knockoutLogic === 'EFFICIENCY') {
          const sortedByEfficiency = sortTeams(allAdvancedTeams, activeTournament.tieBreakRules, updatedMatches);
          const n = sortedByEfficiency.length;
          for (let i = 0; i < n / 2; i++) {
            teamOrderForKnockout.push(sortedByEfficiency[i].id);
            teamOrderForKnockout.push(sortedByEfficiency[n - 1 - i].id);
          }
        } else {
          const groupKeys = Object.keys(advancedTeamsByGroup).sort();
          if (groupKeys.length === 2) {
             const gA = advancedTeamsByGroup[groupKeys[0]];
             const gB = advancedTeamsByGroup[groupKeys[1]];
             if (gA[0] && gB[1]) { teamOrderForKnockout.push(gA[0].id); teamOrderForKnockout.push(gB[1].id); }
             if (gB[0] && gA[1]) { teamOrderForKnockout.push(gB[0].id); teamOrderForKnockout.push(gA[1].id); }
          } else {
             for(let i=0; i<groupKeys.length; i+=2) {
                const g1 = advancedTeamsByGroup[groupKeys[i]];
                const g2 = advancedTeamsByGroup[groupKeys[i+1]];
                if (g1 && g2) {
                  if (g1[0] && g2[1]) { teamOrderForKnockout.push(g1[0].id); teamOrderForKnockout.push(g2[1].id); }
                  if (g2[0] && g1[1]) { teamOrderForKnockout.push(g2[0].id); teamOrderForKnockout.push(g1[1].id); }
                } else if (g1) {
                  teamOrderForKnockout.push(...g1.map(t => t.id));
                }
             }
          }
        }

        const totalAdvanced = teamOrderForKnockout.length;
        let nextStage: Stage = 'FINAL';
        if (totalAdvanced > 8) nextStage = 'ROUND_16';
        else if (totalAdvanced > 4) nextStage = 'QUARTER_FINAL';
        else if (totalAdvanced > 2) nextStage = 'SEMI_FINAL';
        else nextStage = 'FINAL';

        nextMatches = generateKnockoutMatches(teamOrderForKnockout, nextStage, (updatedMatches[updatedMatches.length - 1]?.round || 0) + 1, activeTournament.maxTables, 1, { ...activeTournament, teams: teamsWithPos, matches: updatedMatches });
        updateActiveTournament({ ...activeTournament, matches: [...updatedMatches, ...nextMatches], teams: teamsWithPos });
        return;
      } else if (match.stage !== 'FINAL' && match.stage !== 'THIRD_PLACE') {
        const winners = stageMatches.map((m: Match) => {
          if (m.homeScore! === m.awayScore! && activeTournament.useKnockoutAdvantage && m.advantageTeamId) {
            return m.advantageTeamId;
          }
          return m.homeScore! > m.awayScore! ? m.homeTeamId : m.awayTeamId;
        });
        const losers = stageMatches.map((m: Match) => {
          if (m.homeScore! === m.awayScore! && activeTournament.useKnockoutAdvantage && m.advantageTeamId) {
            return m.advantageTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
          }
          return m.homeScore! < m.awayScore! ? m.homeTeamId : m.awayTeamId;
        });

        if (match.stage === 'SEMI_FINAL') {
          const mFinal = generateKnockoutMatches(winners, 'FINAL', (updatedMatches[updatedMatches.length - 1]?.round || 0) + 1, activeTournament.maxTables, 1, activeTournament);
          const mThird = generateKnockoutMatches(losers, 'THIRD_PLACE', (updatedMatches[updatedMatches.length - 1]?.round || 0) + 1, activeTournament.maxTables, 2, activeTournament);
          nextMatches = [...mFinal, ...mThird];
        } else {
          const nextStage: Stage = match.stage === 'ROUND_16' ? 'QUARTER_FINAL' : (match.stage === 'QUARTER_FINAL' ? 'SEMI_FINAL' : 'FINAL');
          nextMatches = generateKnockoutMatches(winners, nextStage, (updatedMatches[updatedMatches.length - 1]?.round || 0) + 1, activeTournament.maxTables, 1, activeTournament);
        }
      } else if (updatedMatches.filter(m => m.stage === 'FINAL' || m.stage === 'THIRD_PLACE').every(m => m.isFinished)) {
        updateActiveTournament({ ...activeTournament, matches: updatedMatches, teams: updatedTeams, isFinished: true });
        setView(ViewState.FINAL_RANKING);
        return;
      }
    }
    updateActiveTournament({ ...activeTournament, matches: [...updatedMatches, ...nextMatches], teams: updatedTeams });
  };

  const shareResults = async () => {
    if (!activeTournament) return;
    const text = `🏆 ${activeTournament.name}\nAcompanhe agora na Arena Pro!`;
    if (navigator.share) await navigator.share({ title: 'Arena Pro', text, url: window.location.href });
    else { await navigator.clipboard.writeText(text); alert('Link copiado!'); }
  };

  const handlePrint = () => {
    setView(ViewState.PRINT);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isQuickEditOpen) setTeamToQuickEdit(prev => prev ? { ...prev, logoUrl: reader.result as string } : null);
        else setNewTeamLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const matchesByRound = useMemo(() => {
    if (!activeTournament) return {} as Record<number, Match[]>;
    const grouped: Record<number, Match[]> = {};
    activeTournament.matches.forEach(m => {
      if (!grouped[m.round]) grouped[m.round] = [];
      grouped[m.round].push(m);
    });
    return grouped;
  }, [activeTournament]);

  const currentRoundNumber = useMemo(() => {
    if (!activeTournament) return null;
    const sortedRounds = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
    for (const roundNum of sortedRounds) {
      if ((matchesByRound[roundNum] as Match[]).some(m => !m.isFinished)) return roundNum;
    }
    return sortedRounds.length > 0 ? sortedRounds[sortedRounds.length - 1] : null;
  }, [matchesByRound, activeTournament]);

  const filteredHistoryTeams = useMemo(() => {
    if (!teamSearch) return savedTeams;
    return savedTeams.filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase()));
  }, [savedTeams, teamSearch]);

  const openQuickEdit = (teamId: string) => {
    if (teamId === 'TBD' || teamId === 'BYE') return;
    const t = activeTournament?.teams.find(x => x.id === teamId);
    if (t) {
      setTeamToQuickEdit(t);
      setIsQuickEditOpen(true);
    }
  };

  const openHistoryEdit = (st: SavedTeam) => {
    const mockTeam: Team = {
      id: st.name,
      name: st.name,
      logoUrl: st.logoUrl,
      players: st.players || [],
      points: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0
    };
    setTeamToQuickEdit(mockTeam);
    setIsQuickEditOpen(true);
  };

  // --- Statistics Calculation ---
  const competitionStats = useMemo(() => {
    if (!activeTournament || activeTournament.teams.length === 0) return { topScorerTeam: null, totalGoals: 0 };
    
    let total = 0;
    let topTeam = activeTournament.teams[0];
    
    activeTournament.teams.forEach(t => {
      if (t.goalsFor > topTeam.goalsFor) topTeam = t;
    });

    total = activeTournament.matches.reduce((acc, m) => acc + (m.homeScore || 0) + (m.awayScore || 0), 0);

    return { topScorerTeam: topTeam, totalGoals: total };
  }, [activeTournament]);

  return (
    <div className="min-h-screen bg-slate-50 md:pl-64">
      <style>{`
        @media print {
          body { background: white !important; font-size: 10pt; }
          main { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
          aside, nav, .no-print, button, .controls, .bottom-nav { display: none !important; }
          .min-h-screen { padding: 0 !important; margin: 0 !important; }
          .bg-slate-50 { background-color: white !important; }
          .bg-white { background-color: white !important; border: 1px solid #ddd !important; }
          .print-section { page-break-inside: avoid; page-break-after: auto; margin-bottom: 2rem; }
          .print-full-page { page-break-before: always; }
          .shadow-sm, .shadow-md, .shadow-xl { shadow: none !important; }
          * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
        }
      `}</style>
      <CameraModal 
        isOpen={isCameraOpen} 
        onClose={() => setIsCameraOpen(false)} 
        onCapture={(data) => {
          if (isQuickEditOpen) setTeamToQuickEdit(prev => prev ? { ...prev, logoUrl: data } : null);
          else setNewTeamLogo(data);
        }} 
      />
      <TeamEditModal 
        isOpen={isQuickEditOpen} 
        team={teamToQuickEdit} 
        onClose={() => { setIsQuickEditOpen(false); setTeamToQuickEdit(null); }} 
        onSave={handleQuickEditSave}
        onCameraOpen={() => setIsCameraOpen(true)}
        onFileUpload={() => fileInputRef.current?.click()}
      />
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*" 
        className="hidden" 
      />
      
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white hidden md:flex flex-col z-50 no-print">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800 cursor-pointer" onClick={() => setView(ViewState.DASHBOARD)}>
          <Trophy className="text-emerald-400 w-8 h-8" />
          <h1 className="text-xl font-bold">Arena Pro</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto no-scrollbar">
          <NavItem icon={<LayoutGrid />} label="Início" active={view === ViewState.DASHBOARD} onClick={() => setView(ViewState.DASHBOARD)} />
          <NavItem icon={<History />} label="Meus Torneios" active={view === ViewState.MY_TOURNAMENTS} onClick={() => setView(ViewState.MY_TOURNAMENTS)} />
          {activeTournament && (
            <div className="pt-4 mt-4 border-t border-slate-800 space-y-1">
              <NavItem icon={<Users />} label="Equipes" active={view === ViewState.TEAMS} onClick={() => setView(ViewState.TEAMS)} />
              <NavItem icon={<Calendar />} label="Jogos" active={view === ViewState.MATCHES} onClick={() => setView(ViewState.MATCHES)} />
              <NavItem icon={<GitMerge />} label="Chaveamento" active={view === ViewState.BRACKET} onClick={() => setView(ViewState.BRACKET)} />
              <NavItem icon={<TrophyIcon />} label="Grupos" active={view === ViewState.STANDINGS} onClick={() => setView(ViewState.STANDINGS)} />
              <NavItem icon={<BarChart3 />} label="Classif. Geral" active={view === ViewState.GLOBAL_STANDINGS} onClick={() => setView(ViewState.GLOBAL_STANDINGS)} />
              <NavItem icon={<TableIcon />} label="Locais" active={view === ViewState.TABLES} onClick={() => setView(ViewState.TABLES)} />
              {activeTournament.isFinished && <NavItem icon={<CheckCircle2 />} label="Podium" active={view === ViewState.FINAL_RANKING} onClick={() => setView(ViewState.FINAL_RANKING)} />}
              <div className="h-px bg-slate-800 my-4"></div>
              <button onClick={handlePrint} className="w-full flex items-center gap-4 px-5 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"><Printer size={20}/> <span className="text-sm font-bold">Imprimir Campeonato</span></button>
              <button onClick={shareResults} className="w-full flex items-center gap-4 px-5 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"><Share2 size={20}/> <span className="text-sm font-bold">Compartilhar</span></button>
            </div>
          )}
        </nav>
      </aside>

      <main className="p-4 md:p-8 max-w-7xl mx-auto overflow-x-auto relative pb-20">
        {activeTournament && (
          <div className="sticky top-0 z-[60] -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-slate-50/80 backdrop-blur-xl border-b border-slate-200 mb-6 no-print">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
              <SubNavButton icon={<Users size={18}/>} label="Equipes" active={view === ViewState.TEAMS} onClick={() => setView(ViewState.TEAMS)} />
              <SubNavButton icon={<Calendar size={18}/>} label="Jogos" active={view === ViewState.MATCHES} onClick={() => setView(ViewState.MATCHES)} />
              <SubNavButton icon={<GitMerge size={18}/>} label="Chave" active={view === ViewState.BRACKET} onClick={() => setView(ViewState.BRACKET)} />
              <SubNavButton icon={<TrophyIcon size={18}/>} label="Grupos" active={view === ViewState.STANDINGS} onClick={() => setView(ViewState.STANDINGS)} />
              <SubNavButton icon={<BarChart3 size={18}/>} label="Classif." active={view === ViewState.GLOBAL_STANDINGS} onClick={() => setView(ViewState.GLOBAL_STANDINGS)} />
              <SubNavButton icon={<TableIcon size={18}/>} label="Locais" active={view === ViewState.TABLES} onClick={() => setView(ViewState.TABLES)} />
              <div className="w-px h-6 bg-slate-200 mx-2"></div>
              <SubNavButton icon={<Printer size={18}/>} label="Imprimir" onClick={handlePrint} variant="action" />
              <SubNavButton icon={<Share2 size={18}/>} label="Partilhar" onClick={shareResults} variant="action" />
            </div>
          </div>
        )}

        {view !== ViewState.DASHBOARD && (
          <button 
            onClick={() => setView(ViewState.DASHBOARD)}
            className="flex items-center gap-2 text-slate-500 hover:text-emerald-600 transition-colors mb-6 font-bold text-xs uppercase tracking-wider no-print"
          >
            <ArrowLeft size={16} /> Voltar ao Menu Principal
          </button>
        )}

        {view === ViewState.DASHBOARD && (
          <div className="animate-in fade-in duration-500">
            <h2 className="text-4xl font-black text-slate-900 mb-8">Gestão Profissional</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <button onClick={() => setView(ViewState.CREATE)} className="group p-10 bg-emerald-600 rounded-3xl text-white text-left shadow-xl hover:scale-[1.01] transition-all">
                <PlusCircle size={40} className="mb-4 group-hover:rotate-90 transition-transform" />
                <h3 className="text-2xl font-bold">Novo Torneio</h3>
                <p className="opacity-80">Ligas, Copas e Grupos.</p>
              </button>
              <button onClick={() => setView(ViewState.MY_TOURNAMENTS)} className="p-10 bg-slate-900 rounded-3xl text-white text-left shadow-xl hover:scale-[1.01] transition-all">
                <History size={40} className="mb-4" />
                <h3 className="text-2xl font-bold">Histórico</h3>
                <p className="opacity-80">Acesse seus registros salvos.</p>
              </button>
            </div>
            {tournaments.length > 0 && (
              <div className="mt-12">
                <h3 className="text-lg font-bold text-slate-400 mb-4 uppercase tracking-widest">Atividade Recente</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {tournaments.slice(-3).reverse().map(t => (
                    <div key={t.id} onClick={() => { setActiveId(t.id); setView(ViewState.MATCHES); }} className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md cursor-pointer transition-shadow">
                      <Trophy size={24} className="text-emerald-500 mb-3" />
                      <h4 className="font-bold text-slate-800 line-clamp-1">{t.name}</h4>
                      <p className="text-xs text-slate-400 mt-1">{t.teams.length} equipes • {new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === ViewState.MY_TOURNAMENTS && (
          <div className="animate-in fade-in">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black">Histórico de Torneios</h2>
              <button onClick={() => setView(ViewState.CREATE)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg"><PlusCircle size={16}/> Novo</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tournaments.length === 0 ? (
                <div className="col-span-full py-20 text-center text-slate-300">Nenhum torneio encontrado.</div>
              ) : (
                [...tournaments].reverse().map(t => (
                  <div key={t.id} className="bg-white rounded-[2rem] border overflow-hidden hover:shadow-xl transition-all group">
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded-2xl ${t.isFinished ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                          <Trophy size={20} />
                        </div>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (window.confirm("Tem certeza da exclusão definitiva do torneio?")) {
                              setTournaments(prev => prev.filter(x => x.id !== t.id)); 
                              if(activeId === t.id) setActiveId(null); 
                            }
                          }} 
                          className="p-3 text-slate-300 hover:text-red-500 transition-colors bg-slate-50 rounded-xl"
                          title="Excluir Torneio"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-6 group-hover:text-emerald-600 transition-colors">{t.name}</h3>
                      <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                        <span className="flex items-center gap-1"><Users size={14}/> {t.teams.length}</span>
                        <span className="flex items-center gap-1"><Calendar size={14}/> {new Date(t.createdAt).toLocaleDateString()}</span>
                        <span className={`px-2 py-0.5 rounded-full ${t.isFinished ? 'bg-slate-100' : 'bg-emerald-50 text-emerald-600'}`}>
                          {t.isFinished ? 'Encerrado' : 'Em andamento'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => { setActiveId(t.id); setView(ViewState.MATCHES); }} className="w-full py-4 bg-slate-900 text-white font-bold text-sm">Abrir Torneio</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === ViewState.CREATE && (
          <div className="max-w-xl mx-auto bg-white p-10 rounded-[3rem] shadow-xl animate-in zoom-in-95 border">
            <h2 className="text-3xl font-black mb-6">Configurar Novo Torneio</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              handleCreateTournament(
                f.get('name') as string, 
                parseInt(f.get('tables') as string), 
                selectedFormat, 
                f.get('locationLabel') as string,
                f.get('groups') ? parseInt(f.get('groups') as string) : undefined,
                f.get('advance') ? parseInt(f.get('advance') as string) : undefined
              );
            }}>
              <div className="space-y-6">
                <div><label className="block text-sm font-bold mb-2">Nome do Torneio</label><input name="name" required className="w-full p-4 bg-slate-50 border rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: Copa Libertadores Arena" /></div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">Formato</label>
                    <select onChange={(e) => setSelectedFormat(e.target.value as TournamentFormat)} className="w-full p-4 bg-slate-50 border rounded-2xl outline-none">
                      <option value="LEAGUE">Pontos Corridos</option>
                      <option value="GROUPS_KNOCKOUT">Grupos + Mata-Mata</option>
                      <option value="KNOCKOUT">Mata-Mata</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2 flex items-center gap-1"><MapPin size={14}/> Nome do Local</label>
                    <input name="locationLabel" defaultValue="Mesa" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" placeholder="Ex: Mesa, Campo, Quadra" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Quantidade de Locais</label>
                  <input name="tables" type="number" defaultValue="4" min="1" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" />
                </div>
                
                {selectedFormat === 'GROUPS_KNOCKOUT' && (
                  <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold mb-2">Nº de Grupos</label>
                        <input name="groups" type="number" defaultValue="2" min="1" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold mb-2">Avançam por grupo</label>
                        <input name="advance" type="number" defaultValue="2" min="1" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" />
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 p-6 rounded-[2rem] border">
                      <label className="block text-sm font-bold mb-4 flex items-center gap-2"><Divide size={18} className="text-emerald-600"/> Lógica do Cruzamento</label>
                      <div className="grid grid-cols-2 gap-3">
                         <button 
                            type="button"
                            onClick={() => setKnockoutLogic('OLYMPIC')}
                            className={`p-4 rounded-2xl border-2 transition-all text-left ${knockoutLogic === 'OLYMPIC' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-emerald-200'}`}
                         >
                            <p className="font-black text-xs uppercase mb-1">Olímpico</p>
                            <p className={`text-[10px] ${knockoutLogic === 'OLYMPIC' ? 'text-emerald-50' : 'text-slate-400'}`}>1º Grupo A vs 2º Grupo B</p>
                         </button>
                         <button 
                            type="button"
                            onClick={() => setKnockoutLogic('EFFICIENCY')}
                            className={`p-4 rounded-2xl border-2 transition-all text-left ${knockoutLogic === 'EFFICIENCY' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-emerald-200'}`}
                         >
                            <p className="font-black text-xs uppercase mb-1">Aproveitamento</p>
                            <p className={`text-[10px] ${knockoutLogic === 'EFFICIENCY' ? 'text-emerald-50' : 'text-slate-400'}`}>Melhor Geral vs Pior Geral</p>
                         </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {(selectedFormat === 'KNOCKOUT' || selectedFormat === 'GROUPS_KNOCKOUT') && (
                  <div className="bg-slate-50 p-6 rounded-[2rem] border flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <Zap size={18} className="text-amber-500" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">Vantagem de Empate</p>
                          <p className="text-[10px] text-slate-400">Melhor Campanha (Grupos) avança no empate</p>
                        </div>
                     </div>
                     <button 
                        type="button"
                        onClick={() => setUseKnockoutAdvantage(!useKnockoutAdvantage)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${useKnockoutAdvantage ? 'bg-emerald-600' : 'bg-slate-300'}`}
                     >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${useKnockoutAdvantage ? 'left-7' : 'left-1'}`} />
                     </button>
                  </div>
                )}

                <div className="bg-slate-50 p-6 rounded-[2rem] border">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-sm font-bold flex items-center gap-2"><BarChart3 size={18} /> Ordem de Desempate</p>
                    <div className="relative group">
                      <button type="button" className="text-[10px] bg-slate-200 px-2 py-1 rounded-full font-black">ADICIONAR REGRA</button>
                      <div className="absolute top-full right-0 mt-2 w-48 bg-white border shadow-2xl rounded-2xl p-2 hidden group-hover:block z-20">
                        {TIE_BREAK_OPTIONS.map(opt => (
                          <button 
                            key={opt.value}
                            type="button"
                            onClick={() => { if(!tieBreakRules.includes(opt.value)) setTieBreakRules([...tieBreakRules, opt.value])}}
                            className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-emerald-50 hover:text-emerald-600 rounded-xl transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {tieBreakRules.map((ruleValue, i) => (
                      <div key={ruleValue} className="flex items-center gap-3 p-3 bg-white border rounded-xl shadow-sm text-xs font-bold animate-in slide-in-from-left-2">
                        <span className="text-slate-400">{i+1}º</span>
                        <span className="flex-1">{TIE_BREAK_OPTIONS.find(o => o.value === ruleValue)?.label || ruleValue}</span>
                        <div className="flex gap-1 items-center">
                          <button type="button" onClick={() => { const n=[...tieBreakRules]; if(i>0) { [n[i], n[i-1]] = [n[i-1], n[i]]; setTieBreakRules(n); } }} className="p-1 hover:bg-slate-100 rounded"><ChevronUp size={14}/></button>
                          <button type="button" onClick={() => { const n=[...tieBreakRules]; if(i<tieBreakRules.length-1) { [n[i], n[i+1]] = [n[i+1], n[i]]; setTieBreakRules(n); } }} className="p-1 hover:bg-slate-100 rounded"><ChevronDown size={14}/></button>
                          <button type="button" onClick={() => setTieBreakRules(tieBreakRules.filter(r => r !== ruleValue))} className="p-1 text-slate-300 hover:text-red-500 ml-1"><X size={14}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-100 disabled:opacity-50">
                  {loading ? 'Processando...' : 'Criar Torneio'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTournament && (view === ViewState.TEAMS) && (
          <div className="animate-in fade-in">
             <div className="flex justify-between items-center mb-8">
               <div>
                  <h2 className="text-3xl font-black">Inscrição de Equipes</h2>
                  <p className="text-slate-400 font-medium">Equipes cadastradas serão salvas no seu histórico</p>
               </div>
             </div>

             {/* NOVO: Seção de Visualização/Acesso Rápido ao Histórico */}
             {savedTeams.length > 0 && (
                <div className="mb-10 bg-emerald-50/50 border border-emerald-100 p-6 rounded-[2.5rem] animate-in slide-in-from-top-4 duration-500">
                   <div className="flex items-center gap-2 mb-4">
                      <Zap size={18} className="text-emerald-600" />
                      <h3 className="text-sm font-black text-emerald-800 uppercase tracking-widest">Re-inscrição Rápida</h3>
                   </div>
                   <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar no-scrollbar">
                      {savedTeams.slice(0, 15).map((st, i) => (
                        <button 
                          key={i}
                          onClick={() => addTeam(st.name, st.logoUrl, st.players)}
                          className="flex-shrink-0 group relative flex flex-col items-center gap-2 min-w-[80px]"
                        >
                          <div className="relative">
                            <TeamLogo logo={st.logoUrl} className="w-16 h-16 text-3xl bg-white border border-emerald-200 rounded-[1.5rem] shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all" />
                            <div className="absolute inset-0 bg-emerald-600/0 group-hover:bg-emerald-600/80 rounded-[1.5rem] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                               <Plus size={24} className="text-white" />
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-slate-600 truncate w-16 text-center">{st.name}</span>
                        </button>
                      ))}
                   </div>
                </div>
             )}

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="space-y-6">
                 <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border sticky top-24">
                   <h3 className="font-bold mb-6 text-slate-800 flex items-center gap-2"><ImageIcon size={18}/> {editingTeam ? 'Editar Equipe' : 'Adicionar Equipe'}</h3>
                   
                   <div className="flex justify-center mb-6 relative">
                     <div className="w-32 h-32 bg-slate-100 rounded-[2rem] flex items-center justify-center border-2 border-dashed border-slate-300 group overflow-hidden">
                       <TeamLogo logo={newTeamLogo} className="w-full h-full text-5xl" />
                       <div className="absolute bottom-0 right-0 flex gap-1 p-2">
                         <button 
                          onClick={() => setIsCameraOpen(true)}
                          className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg hover:scale-110 transition-transform active:scale-95"
                          title="Tirar Foto"
                         >
                           <Camera size={20} />
                         </button>
                         <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="p-3 bg-slate-700 text-white rounded-2xl shadow-lg hover:scale-110 transition-transform active:scale-95"
                          title="Carregar Arquivo"
                         >
                           <Upload size={20} />
                         </button>
                       </div>
                     </div>
                   </div>

                   <div className="space-y-4">
                     <div>
                       <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Nome da Equipe</label>
                       <input 
                         value={newTeamName} 
                         onChange={(e) => setNewTeamName(e.target.value)}
                         className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" 
                         placeholder="Ex: Galáticos FC" 
                       />
                     </div>
                     
                     {!editingTeam && savedTeams.length > 0 && (
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Preencher do Histórico</label>
                          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                            {savedTeams.slice(0, 8).map((st, i) => (
                              <button 
                                key={i}
                                onClick={() => { setNewTeamName(st.name); setNewTeamLogo(st.logoUrl); }}
                                className="flex-shrink-0 p-2 bg-slate-50 border rounded-xl hover:border-emerald-500 transition-all flex flex-col items-center gap-1 min-w-[64px]"
                              >
                                <TeamLogo logo={st.logoUrl} className="w-8 h-8 text-xl" />
                                <span className="text-[8px] font-bold text-slate-500 truncate w-12 text-center">{st.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                     )}

                     <div>
                       <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 block">Emoji (Alternativo)</label>
                        <button onClick={() => setNewTeamLogo(TEAM_LOGOS[Math.floor(Math.random()*TEAM_LOGOS.length)])} className="text-[10px] text-emerald-600 font-black"><RefreshCw size={10} className="inline mr-1" /> ALEATÓRIO</button>
                       </div>
                       <div className="grid grid-cols-4 gap-2 h-24 overflow-y-auto pr-2 custom-scrollbar">
                         {TEAM_LOGOS.map(emoji => (
                           <button 
                             key={emoji} 
                             onClick={() => setNewTeamLogo(emoji)} 
                             className={`w-full aspect-square text-2xl flex items-center justify-center rounded-xl transition-all ${newTeamLogo === emoji ? 'bg-emerald-600 text-white scale-110 shadow-lg' : 'bg-slate-50 border hover:bg-slate-100'}`}
                           >
                             {emoji}
                           </button>
                         ))}
                       </div>
                     </div>
                     {editingTeam ? (
                       <div className="flex gap-2 pt-4">
                         <button onClick={saveTeamEdit} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold">Salvar</button>
                         <button onClick={() => { setEditingTeam(null); setNewTeamName(''); setNewTeamLogo(TEAM_LOGOS[0]); }} className="px-6 py-4 bg-slate-100 rounded-2xl font-bold">X</button>
                       </div>
                     ) : (
                       <button onClick={() => { if(newTeamName) { addTeam(newTeamName, newTeamLogo); setNewTeamName(''); setNewTeamLogo(TEAM_LOGOS[0]); } }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-lg mt-4">Inscrever Equipe</button>
                     )}
                   </div>
                   {!editingTeam && <button onClick={() => suggestTeamNames().then(n => n.forEach(name => addTeam(name)))} className="w-full mt-4 text-emerald-600 font-bold text-sm hover:underline">Sugerir nomes com IA</button>}
                 </div>
               </div>

               <div className="lg:col-span-2 space-y-6">
                 <div className="bg-white rounded-[2.5rem] shadow-sm border divide-y overflow-hidden">
                    <div className="p-6 bg-slate-50/50 border-b flex justify-between items-center">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Inscritas ({activeTournament.teams.length})</h3>
                        {activeTournament.teams.length >= 2 && (
                          <button onClick={startTournament} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-black shadow-lg animate-pulse">COMEÇAR AGORA 🚀</button>
                        )}
                    </div>
                    {activeTournament.teams.map(t => (
                      <div key={t.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-4">
                          <TeamLogo logo={t.logoUrl} className="w-12 h-12 text-2xl bg-slate-100 rounded-2xl group-hover:bg-white transition-colors" />
                          <div>
                            <span className="font-black text-slate-800 text-lg block">{t.name}</span>
                            {t.group && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase">Grupo {t.group}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingTeam(t); setNewTeamName(t.name); setNewTeamLogo(t.logoUrl || TEAM_LOGOS[0]); }} className="p-3 text-slate-400 hover:text-emerald-600 hover:bg-white rounded-xl transition-all">
                            <Edit2 size={18}/>
                          </button>
                          <button onClick={() => updateActiveTournament({...activeTournament, teams: activeTournament.teams.filter(x=>x.id!==t.id)})} className="p-3 text-slate-400 hover:text-red-500 hover:bg-white rounded-xl transition-all">
                            <Trash2 size={18}/>
                          </button>
                        </div>
                      </div>
                    ))}
                    {activeTournament.teams.length === 0 && (
                      <div className="p-32 text-center">
                        <Users size={64} className="mx-auto text-slate-100 m-4" />
                        <p className="text-slate-300 font-bold">Inicie a inscrição adicionando equipes ao lado.</p>
                      </div>
                    )}
                 </div>

                 {savedTeams.length > 0 && (
                    <div className="bg-white rounded-[2.5rem] shadow-sm border p-8">
                       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                          <div>
                            <h3 className="text-xl font-black text-slate-800">Histórico de Equipes</h3>
                            <p className="text-xs text-slate-400 font-bold">Clique no botão de adicionar para reinscrever</p>
                          </div>
                          <div className="relative w-full md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16}/>
                            <input 
                                value={teamSearch}
                                onChange={(e) => setTeamSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" 
                                placeholder="Buscar equipe..." 
                            />
                          </div>
                       </div>
                       <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                         {filteredHistoryTeams.map((st, i) => (
                           <div key={i} className="group p-4 bg-slate-50 rounded-[2rem] border hover:border-emerald-200 transition-all flex flex-col items-center gap-3 relative">
                             <TeamLogo logo={st.logoUrl} className="w-16 h-16 text-4xl group-hover:scale-110 transition-transform" />
                             <span className="font-black text-slate-800 text-xs text-center line-clamp-1">{st.name}</span>
                             <div className="flex gap-1">
                                <button 
                                    onClick={() => addTeam(st.name, st.logoUrl, st.players)}
                                    className="w-10 h-10 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 transition-all active:scale-95"
                                    title="Inscrever equipe"
                                >
                                    <Plus size={20} />
                                </button>
                                <button 
                                    onClick={() => openHistoryEdit(st)}
                                    className="w-10 h-10 bg-slate-200 text-slate-600 rounded-2xl flex items-center justify-center shadow-md hover:scale-110 transition-all active:scale-95"
                                    title="Editar equipe no histórico"
                                >
                                    <Edit2 size={16} />
                                </button>
                             </div>
                             <button 
                                onClick={() => setSavedTeams(prev => prev.filter(x => x.name !== st.name))}
                                className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                             >
                                <X size={14} />
                             </button>
                           </div>
                         ))}
                         {filteredHistoryTeams.length === 0 && (
                            <div className="col-span-full py-8 text-center text-slate-400 text-sm font-bold">Nenhuma equipe encontrada no histórico.</div>
                         )}
                       </div>
                    </div>
                 )}
               </div>
             </div>
          </div>
        )}

        {activeTournament && (view === ViewState.MATCHES || view === ViewState.STANDINGS || view === ViewState.GLOBAL_STANDINGS || view === ViewState.TABLES || view === ViewState.FINAL_RANKING || view === ViewState.BRACKET || view === ViewState.PRINT) && (
          <div className="animate-in fade-in">
             {view === ViewState.PRINT && (
               <div className="space-y-12 bg-white p-4 md:p-8 rounded-none">
                  <div className="text-center border-b pb-8 mb-8 no-print">
                     <button onClick={() => setView(ViewState.MATCHES)} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2 mx-auto mb-4"><RotateCcw size={16}/> Sair do Modo Impressão</button>
                     <p className="text-xs text-slate-400">Pressione Ctrl+P se a caixa de impressão não abrir automaticamente.</p>
                  </div>
                  
                  {/* Relatório de Impressão */}
                  <div className="print-section text-center">
                    <h1 className="text-4xl font-black text-slate-900 mb-2">{activeTournament.name}</h1>
                    <p className="text-xs text-slate-400 uppercase font-black tracking-widest">Relatório Completo de Torneio • {new Date().toLocaleDateString()}</p>
                  </div>

                  {activeTournament.isFinished && (
                    <div className="print-section">
                       <h2 className="text-xl font-black mb-6 border-l-4 border-emerald-500 pl-4 uppercase">🏆 Pódio Final</h2>
                       <div className="grid grid-cols-3 gap-4">
                          {sortTeams(activeTournament.teams, activeTournament.tieBreakRules, activeTournament.matches).slice(0,3).map((t, idx) => (
                            <div key={idx} className="p-6 border-2 border-slate-100 rounded-2xl flex flex-col items-center">
                               <span className="text-3xl font-black text-slate-200 mb-2">#{idx+1}</span>
                               <TeamLogo logo={t.logoUrl} className="w-12 h-12 text-2xl mb-2" />
                               <span className="font-black text-slate-800 text-center">{t.name}</span>
                            </div>
                          ))}
                       </div>
                    </div>
                  )}

                  {/* Estatísticas no Relatório de Impressão */}
                  <div className="print-section grid grid-cols-2 gap-8 border-t border-b py-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-slate-100 rounded-xl">
                        <Target size={28} className="text-slate-700" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Melhor Ataque (GP)</p>
                        <p className="font-bold text-lg">{competitionStats.topScorerTeam?.name || '---'} ({competitionStats.topScorerTeam?.goalsFor || 0} gols)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-slate-100 rounded-xl">
                        <Flame size={28} className="text-slate-700" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Gols</p>
                        <p className="font-bold text-lg">{competitionStats.totalGoals} gols na competição</p>
                      </div>
                    </div>
                  </div>

                  <div className="print-section">
                    <h2 className="text-xl font-black mb-6 border-l-4 border-emerald-500 pl-4 uppercase">Tabela de Classificação Geral</h2>
                    <StandingsView teams={activeTournament.teams} tournament={activeTournament} />
                  </div>

                  {activeTournament.matches.some(m => m.stage !== 'GROUP' && m.stage !== 'LEAGUE') && (
                    <div className="print-section print-full-page overflow-x-auto">
                      <h2 className="text-xl font-black mb-6 border-l-4 border-emerald-500 pl-4 uppercase">Chaveamento Mata-Mata</h2>
                      <div className="scale-90 origin-top-left">
                        <BracketView tournament={activeTournament} resolveTeam={resolveTeam} onUpdateMatch={updateMatchScore} onEditTeam={openQuickEdit} />
                      </div>
                    </div>
                  )}

                  {activeTournament.format === 'GROUPS_KNOCKOUT' && (
                    <div className="print-section print-full-page">
                      <h2 className="text-xl font-black mb-6 border-l-4 border-emerald-500 pl-4 uppercase">Classificação por Grupos</h2>
                      <div className="space-y-12">
                        {Array.from(new Set(activeTournament.teams.map(t => t.group))).filter((gid): gid is string => Boolean(gid)).sort().map(gid => (
                          <div key={gid} className="page-break-inside-avoid">
                            <h3 className="font-black text-slate-400 mb-2 uppercase text-xs border-b pb-1">Grupo {gid}</h3>
                            <StandingsView teams={activeTournament.teams.filter(t => t.group === gid)} tournament={activeTournament} compact />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="print-section print-full-page">
                    <h2 className="text-xl font-black mb-6 border-l-4 border-emerald-500 pl-4 uppercase">Histórico de Jogos</h2>
                    <div className="space-y-8">
                      {Object.entries(matchesByRound).sort(([a], [b]) => Number(a) - Number(b)).map(([round, matches]) => {
                        const stage = matches[0]?.stage;
                        const stageLabel = (stage === 'LEAGUE' || stage === 'GROUP') ? `Rodada ${round}` : `${STAGE_LABELS[stage]} (Rodada ${round})`;
                        return (
                          <div key={round}>
                            <h3 className="font-black text-slate-900 mb-3 text-sm border-l-2 border-slate-300 pl-2">{stageLabel}</h3>
                            <div className="grid grid-cols-1 gap-2">
                               {matches.map(m => {
                                 const home = resolveTeam(m.homeTeamId);
                                 const away = resolveTeam(m.awayTeamId);
                                 return (
                                   <div key={m.id} className="flex items-center justify-between p-3 border rounded-xl text-xs">
                                      <span className="w-16 font-bold text-slate-400">#{m.tableNumber}</span>
                                      <div className="flex-1 flex items-center justify-end gap-3 pr-4">
                                        <span className="font-bold truncate">{home.name}</span>
                                        <TeamLogo logo={home.logo} className="w-5 h-5" />
                                      </div>
                                      <div className="w-20 flex justify-center items-center gap-2 bg-slate-50 font-black rounded-lg py-1">
                                        <span>{m.isFinished ? m.homeScore : '-'}</span>
                                        <span>X</span>
                                        <span>{m.isFinished ? m.awayScore : '-'}</span>
                                      </div>
                                      <div className="flex-1 flex items-center justify-start gap-3 pl-4">
                                        <TeamLogo logo={away.logo} className="w-5 h-5" />
                                        <span className="font-bold truncate">{away.name}</span>
                                      </div>
                                   </div>
                                 );
                               })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
               </div>
             )}

             {view === ViewState.MATCHES && (
               <div className="space-y-12">
                 <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-black text-slate-900">Cronograma de Jogos</h2>
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-2xl text-xs font-bold border border-emerald-100 shadow-sm">
                      <Trophy size={14}/> {activeTournament.name}
                    </div>
                 </div>
                 {Object.entries(matchesByRound).sort(([a], [b]) => Number(a) - Number(b)).map(([round, matchesData]) => {
                   const matches = matchesData as Match[];
                   const roundNum = Number(round);
                   const isCurrent = roundNum === currentRoundNumber;
                   const allFinished = matches.every(m => m.isFinished);

                   return (
                     <div key={round} className={`animate-in slide-in-from-bottom-4 duration-500`}>
                       <div className="flex items-center gap-4 mb-6 ml-4">
                          <h3 className={`text-xl font-black flex items-center gap-3 uppercase tracking-widest ${isCurrent ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <Calendar size={20} /> Rodada {round}
                          </h3>
                          {isCurrent && <span className="flex items-center gap-1 px-3 py-1 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-emerald-500/20 animate-pulse"><Clock size={12} /> Em Andamento</span>}
                       </div>
                       
                       <div className="bg-black/95 p-6 md:p-10 rounded-sm border border-white/10 shadow-2xl overflow-hidden ring-1 ring-white/5 space-y-4">
                         {matches.map(m => {
                           const homeTeam = resolveTeam(m.homeTeamId);
                           const awayTeam = resolveTeam(m.awayTeamId);
                           return (
                             <MatchRow 
                               key={m.id} 
                               match={m} 
                               hName={homeTeam.name} 
                               hLogo={homeTeam.logo}
                               hId={homeTeam.id}
                               aName={awayTeam.name} 
                               aLogo={awayTeam.logo}
                               aId={awayTeam.id}
                               onUpdate={updateMatchScore} 
                               onUpdateTable={(id: string, tNum: number) => updateActiveTournament({ ...activeTournament, matches: activeTournament.matches.map(x => x.id === id ? { ...x, tableNumber: tNum } : x) })}
                               onEditTeam={openQuickEdit}
                               maxTables={activeTournament.maxTables}
                               locationLabel={activeTournament.locationLabel}
                               roundMatches={matches}
                               isCurrentRound={isCurrent}
                               showAdvantage={activeTournament.useKnockoutAdvantage}
                               variant="dark"
                             />
                           );
                         })}
                       </div>
                     </div>
                   );
                 })}
               </div>
             )}

             {view === ViewState.BRACKET && (
               <div className="space-y-4 animate-in fade-in py-12 md:py-20 bg-[#064e3b] rounded-none min-h-screen relative overflow-hidden border-none shadow-2xl no-print">
                 {/* Stadium Lights (Flares) in the top corners */}
                 <div className="absolute top-0 left-0 w-64 h-64 bg-white/20 blur-[100px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                 <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                 
                 {/* Subtle Light Grid dots like in vector */}
                 <div className="absolute top-10 left-10 grid grid-cols-4 gap-2 opacity-30 pointer-events-none">
                    {Array.from({length: 16}).map((_, i) => <div key={i} className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white]"></div>)}
                 </div>
                 <div className="absolute top-10 right-10 grid grid-cols-4 gap-2 opacity-30 pointer-events-none">
                    {Array.from({length: 16}).map((_, i) => <div key={i} className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white]"></div>)}
                 </div>

                 <div className="text-center mb-16 relative z-10">
                    <h2 className="text-5xl md:text-6xl font-black text-white uppercase tracking-tight drop-shadow-lg leading-none">{activeTournament.name}</h2>
                    <div className="mt-2 text-xl font-bold text-white/80 uppercase tracking-[0.3em] italic">
                       Chaveamento Mata-Mata
                    </div>
                 </div>

                 <div className="relative z-10 px-4 mt-8">
                   <BracketView 
                      tournament={activeTournament} 
                      resolveTeam={resolveTeam} 
                      onUpdateMatch={updateMatchScore}
                      onEditTeam={openQuickEdit}
                   />
                 </div>
               </div>
             )}
             
             {(view === ViewState.STANDINGS || view === ViewState.GLOBAL_STANDINGS) && (
               <div className="space-y-8">
                 <h2 className="text-3xl font-black text-slate-900">Tabela de Classificação</h2>
                 <div className="space-y-12">
                   {view === ViewState.STANDINGS && activeTournament.format === 'GROUPS_KNOCKOUT' ? (
                     Array.from(new Set(activeTournament.teams.map(t => t.group))).filter((gid): gid is string => Boolean(gid)).sort().map(gid => (
                       <div key={gid} className="animate-in slide-in-from-bottom-4 duration-500">
                         <h3 className="font-black text-emerald-600 mb-6 ml-4 uppercase text-lg tracking-widest flex items-center gap-3">
                           <LayoutGrid size={24} /> Grupo {gid}
                         </h3>
                         <div className="bg-black/95 p-6 md:p-10 rounded-sm border border-white/10 shadow-2xl overflow-hidden ring-1 ring-white/5">
                           <StandingsView 
                             teams={activeTournament.teams.filter(t => t.group === gid)} 
                             tournament={activeTournament} 
                             variant="dark" 
                             highlightCount={activeTournament.advanceCountPerGroup}
                           />
                         </div>
                       </div>
                     ))
                   ) : (
                     <div className="space-y-6">
                        <div className="bg-black/95 p-8 md:p-12 rounded-sm border border-white/10 shadow-2xl overflow-hidden ring-1 ring-white/5 animate-in fade-in duration-700">
                          <StandingsView 
                            teams={activeTournament.teams} 
                            tournament={activeTournament} 
                            variant="dark" 
                            highlightCount={activeTournament.format === 'LEAGUE' ? 3 : undefined}
                          />
                        </div>
                        
                        {/* Statistics Section Below Global Standings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-bottom-6 duration-700 delay-100">
                           <div className="bg-emerald-600 p-6 rounded-[2.5rem] flex items-center gap-6 shadow-xl border border-white/10">
                              <div className="bg-white/20 p-4 rounded-3xl">
                                <Target className="text-white w-10 h-10" />
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest mb-1">Melhor Ataque (GP)</p>
                                <div className="flex items-center gap-3">
                                  <TeamLogo logo={competitionStats.topScorerTeam?.logoUrl} className="w-8 h-8 rounded-lg bg-white/20" />
                                  <h4 className="text-xl font-black text-white truncate max-w-[120px] md:max-w-[200px]">{competitionStats.topScorerTeam?.name || '---'}</h4>
                                  <span className="bg-emerald-600 text-white px-3 py-1 rounded-full font-black text-lg">{competitionStats.topScorerTeam?.goalsFor || 0}</span>
                                </div>
                              </div>
                           </div>
                           
                           <div className="bg-slate-900 p-6 rounded-[2.5rem] flex items-center gap-6 shadow-xl border border-white/10">
                              <div className="bg-white/5 p-4 rounded-3xl">
                                <Flame className="text-amber-500 w-10 h-10" />
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gols na Competição</p>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-4xl font-black text-white">{competitionStats.totalGoals}</span>
                                  <span className="text-sm font-bold text-slate-500 uppercase">Gols Marcados</span>
                                </div>
                              </div>
                           </div>
                        </div>
                     </div>
                   )}
                 </div>
               </div>
             )}

             {view === ViewState.TABLES && (
                <div className="space-y-8">
                  <h2 className="text-3xl font-black">Ocupação de {activeTournament.locationLabel}s</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {Array.from({ length: activeTournament.maxTables }).map((_, i) => {
                      const tNum = i + 1;
                      const m = activeTournament.matches.find(x => x.tableNumber === tNum && !x.isFinished);
                      return (
                        <div key={tNum} className={`p-8 rounded-[2.5rem] border-2 transition-all ${m ? 'bg-emerald-50 border-emerald-200 shadow-lg' : 'bg-white border-slate-100 opacity-60'}`}>
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black mb-6 ${m ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{tNum}</div>
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Status</p>
                          {m ? (
                            <div>
                              <p className="text-emerald-700 font-bold text-xs uppercase mb-3">Em Jogo</p>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                   <TeamLogo logo={resolveTeam(m.homeTeamId).logo} className="w-6 h-6 text-sm" />
                                   <p className="font-bold text-slate-800 line-clamp-1">{resolveTeam(m.homeTeamId).name}</p>
                                </div>
                                <div className="text-[10px] font-black opacity-20 text-center">VS</div>
                                <div className="flex items-center gap-2">
                                   <TeamLogo logo={resolveTeam(m.awayTeamId).logo} className="w-6 h-6 text-sm" />
                                   <p className="font-bold text-slate-800 line-clamp-1">{resolveTeam(m.awayTeamId).name}</p>
                                </div>
                              </div>
                            </div>
                          ) : <p className="text-sm font-bold text-slate-300">Disponível</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
             )}

             {view === ViewState.FINAL_RANKING && (
               <div className="text-center py-10 bg-slate-900 min-h-screen rounded-[4rem] text-white overflow-hidden relative shadow-2xl border-8 border-slate-800">
                  {/* Background Glow */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/10 blur-[120px] pointer-events-none"></div>
                  
                  <div className="relative z-10">
                    <TrophyIcon className="w-20 h-20 text-amber-400 mx-auto mb-6 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)] animate-pulse" />
                    <h2 className="text-6xl font-black mb-2 tracking-tighter uppercase">Pódio Arena Pro</h2>
                    <p className="text-emerald-400 font-black text-xs uppercase tracking-[0.4em] mb-16">Classificação Final Oficial</p>
                    
                    {/* Isometric Podium Layout */}
                    <div className="flex flex-col md:flex-row items-end justify-center gap-2 md:gap-0 max-w-5xl mx-auto px-4 mb-20 mt-10">
                      {(() => {
                        const f = activeTournament.matches.find(m => m.stage === 'FINAL');
                        const t = activeTournament.matches.find(m => m.stage === 'THIRD_PLACE');
                        const sorted = sortTeams(activeTournament.teams, activeTournament.tieBreakRules, activeTournament.matches);
                        
                        // Layout logic: 2-1-3 order
                        const podiumData = activeTournament.format === 'LEAGUE' ? [
                          { label: 'VICE-CAMPEÃO', pos: 2, id: sorted[1]?.id, height: 'h-56 md:h-72', color: 'from-slate-200 to-slate-400', bannerColor: 'bg-blue-600', iconColor: 'text-slate-400', bannerText: 'Vice Campeão' },
                          { label: 'GRANDE CAMPEÃO', pos: 1, id: sorted[0]?.id, height: 'h-72 md:h-96', color: 'from-amber-300 to-amber-500', bannerColor: 'bg-red-600', iconColor: 'text-amber-500', bannerText: 'Campeão' },
                          { label: 'TERCEIRO LUGAR', pos: 3, id: sorted[2]?.id, height: 'h-40 md:h-56', color: 'from-orange-300 to-orange-500', bannerColor: 'bg-emerald-600', iconColor: 'text-orange-600', bannerText: '3° Colocado' }
                        ] : [
                          { label: 'VICE-CAMPEÃO', pos: 2, id: f ? ((f.homeScore! < f.awayScore! || (f.homeScore! === f.awayScore! && f.advantageTeamId === f.awayTeamId)) ? f.homeTeamId : f.awayTeamId) : null, height: 'h-56 md:h-72', color: 'from-slate-200 to-slate-400', bannerColor: 'bg-blue-600', iconColor: 'text-slate-400', bannerText: 'Vice Campeão' },
                          { label: 'GRANDE CAMPEÃO', pos: 1, id: f ? ((f.homeScore! > f.awayScore! || (f.homeScore! === f.awayScore! && f.advantageTeamId === f.homeTeamId)) ? f.homeTeamId : f.awayTeamId) : null, height: 'h-72 md:h-96', color: 'from-amber-300 to-amber-500', bannerColor: 'bg-red-600', iconColor: 'text-amber-500', bannerText: 'Campeão' },
                          { label: 'TERCEIRO LUGAR', pos: 3, id: t ? ((t.homeScore! > t.awayScore! || (t.homeScore! === t.awayScore! && t.advantageTeamId === t.homeTeamId)) ? t.homeTeamId : t.awayTeamId) : null, height: 'h-40 md:h-56', color: 'from-orange-300 to-orange-500', bannerColor: 'bg-emerald-600', iconColor: 'text-orange-600', bannerText: '3° Colocado' }
                        ];

                        return podiumData.map((p, idx) => {
                          const team = p.id ? resolveTeam(p.id) : null;
                          const isWinner = p.pos === 1;
                          
                          return (
                            <div key={idx} className={`w-full md:w-1/3 flex flex-col items-center group relative ${isWinner ? 'z-20 -mx-4 md:-mx-6' : 'z-10'}`}>
                              {/* Trophy and Team Info ABOVE the block */}
                              {team && (
                                <div className={`flex flex-col items-center mb-4 transition-transform duration-500 group-hover:-translate-y-2 animate-in slide-in-from-bottom-${idx*4}`}>
                                  {/* Trophy representation based on image */}
                                  <div className="relative mb-4">
                                     <div className={`w-20 h-20 rounded-full border-4 border-slate-700 bg-slate-800 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform ${isWinner ? 'w-24 h-24' : ''}`}>
                                        <TrophyIcon className={`w-10 h-10 ${p.iconColor} drop-shadow-md ${isWinner ? 'w-12 h-12' : ''}`} />
                                        <span className="absolute -top-1 -right-1 w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center font-black text-lg border-2 border-slate-600">{p.pos}</span>
                                     </div>
                                  </div>
                                  <TeamLogo logo={team.logo} className="w-16 h-16 text-4xl mb-2 drop-shadow-xl" />
                                  <p className="text-lg font-black text-white text-center uppercase tracking-tight line-clamp-1 max-w-[200px] mb-2">{team.name}</p>
                                </div>
                              )}

                              {/* Podium Pedestal Block */}
                              <div className={`w-full ${p.height} bg-gradient-to-br ${p.color} rounded-lg relative overflow-hidden flex flex-col items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-t border-white/30`}>
                                {/* Isometric Top Edge Shadow */}
                                <div className="absolute top-0 left-0 right-0 h-4 bg-black/10"></div>
                                
                                {/* Large Number on the block */}
                                <span className="text-9xl md:text-[12rem] font-black text-black/10 absolute -bottom-4 select-none italic pointer-events-none">{p.pos}</span>
                                
                                {/* Label Banner inspired by image */}
                                <div className={`relative mt-auto mb-8 px-8 py-2 ${p.bannerColor} shadow-xl transform skew-x-[-10deg] rotate-[-2deg]`}>
                                  <p className="text-[10px] md:text-xs font-black text-white uppercase tracking-widest text-center whitespace-nowrap">{p.bannerText}</p>
                                  {/* Banner Ribbons/Edges */}
                                  <div className={`absolute top-1/2 -left-3 -translate-y-1/2 w-4 h-full ${p.bannerColor} brightness-75 -z-10 skew-y-12`}></div>
                                  <div className={`absolute top-1/2 -right-3 -translate-y-1/2 w-4 h-full ${p.bannerColor} brightness-75 -z-10 -skew-y-12`}></div>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    <div className="bg-black/95 p-8 md:p-12 rounded-sm border border-white/10 shadow-inner mb-8 ring-1 ring-white/5">
                      <h3 className="text-xl font-bold mb-8 flex items-center gap-3"><BarChart3 className="text-emerald-400"/> Tabela Completa de Classificação</h3>
                      <StandingsView teams={activeTournament.teams} tournament={activeTournament} variant="dark" highlightCount={3} />
                    </div>

                    {/* Statistics Highlights on Tournament/Global Standings tabs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-24 px-8 md:px-12 animate-in slide-in-from-bottom-6 duration-700">
                       <div className="bg-emerald-600/20 backdrop-blur-md p-6 rounded-[2.5rem] flex items-center gap-6 shadow-xl border border-white/10">
                          <div className="bg-emerald-600 p-4 rounded-3xl">
                            <Target className="text-white w-10 h-10" />
                          </div>
                          <div className="text-left">
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Melhor Ataque (GP)</p>
                            <div className="flex items-center gap-3">
                              <TeamLogo logo={competitionStats.topScorerTeam?.logoUrl} className="w-8 h-8 rounded-lg bg-white/10" />
                              <h4 className="text-xl font-black text-white truncate max-w-[120px] md:max-w-[200px]">{competitionStats.topScorerTeam?.name || '---'}</h4>
                              <span className="bg-emerald-600 text-white px-3 py-1 rounded-full font-black text-lg">{competitionStats.topScorerTeam?.goalsFor || 0}</span>
                            </div>
                          </div>
                       </div>
                       
                       <div className="bg-slate-800/40 backdrop-blur-md p-6 rounded-[2.5rem] flex items-center gap-6 shadow-xl border border-white/10">
                          <div className="bg-slate-800 p-4 rounded-3xl">
                            <Flame className="text-amber-500 w-10 h-10" />
                          </div>
                          <div className="text-left">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gols na Competição</p>
                            <div className="flex items-baseline gap-2">
                              <span className="text-4xl font-black text-white">{competitionStats.totalGoals}</span>
                              <span className="text-sm font-bold text-slate-500 uppercase">Gols Marcados</span>
                            </div>
                          </div>
                       </div>
                    </div>
                  </div>
               </div>
             )}
          </div>
        )}
      </main>
    </div>
  );
};

// --- Sub-components ---

const SubNavButton: React.FC<{ icon: React.ReactNode, label: string, active?: boolean, onClick: () => void, variant?: 'nav' | 'action' }> = ({ icon, label, active, onClick, variant = 'nav' }) => (
  <button 
    onClick={onClick} 
    className={`flex items-center gap-2 px-4 py-2.5 rounded-full transition-all whitespace-nowrap ${active ? 'bg-emerald-600 text-white shadow-lg' : variant === 'action' ? 'text-amber-500 hover:bg-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}
  >
    {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 16 }) : icon}
    <span className="text-xs font-black uppercase tracking-tight">{label}</span>
  </button>
);

const MatchRow: React.FC<{ 
  match: Match, 
  hName: string, 
  hLogo?: string,
  hId: string,
  aName: string, 
  aLogo?: string,
  aId: string,
  onUpdate: any, 
  onUpdateTable: any,
  onEditTeam: (id: string) => void,
  maxTables: number,
  locationLabel: string,
  roundMatches: Match[],
  isCurrentRound: boolean,
  showAdvantage?: boolean,
  variant?: 'light' | 'dark'
}> = ({ match, hName, hLogo, hId, aName, aLogo, aId, onUpdate, onUpdateTable, onEditTeam, maxTables, locationLabel, roundMatches, isCurrentRound, showAdvantage, variant = 'light' }) => {
  const [h, setH] = useState(match.homeScore?.toString() || '');
  const [a, setA] = useState(match.awayScore?.toString() || '');
  const [isEditT, setIsEditT] = useState(false);
  const [isEditingScore, setIsEditingScore] = useState(false);

  const infoLabel = match.groupId ? `G${match.groupId}` : match.stage === 'LEAGUE' ? 'Liga' : match.stage.replace('_', ' ');

  const usedTables = useMemo(() => {
    return new Set(roundMatches.filter(m => m.id !== match.id).map(m => m.tableNumber));
  }, [roundMatches, match.id]);

  const handleConfirm = () => {
    onUpdate(match.id, parseInt(h), parseInt(a));
    setIsEditingScore(false);
  };

  const isHomeWinner = match.isFinished && (match.homeScore! > match.awayScore! || (match.homeScore === match.awayScore && showAdvantage && match.advantageTeamId === match.homeTeamId));
  const isAwayWinner = match.isFinished && (match.awayScore! > match.homeScore! || (match.homeScore === match.awayScore && showAdvantage && match.advantageTeamId === match.awayTeamId));

  const bgClass = variant === 'dark' 
    ? `bg-white/5 border-white/10 ${match.isFinished && !isEditingScore ? 'opacity-60' : 'hover:bg-white/10 shadow-lg'}`
    : `bg-white border-slate-100 ${match.isFinished && !isEditingScore ? 'bg-slate-50/50 opacity-80' : 'hover:border-emerald-200 shadow-sm'}`;

  const textClass = variant === 'dark' ? 'text-white' : 'text-slate-700';
  const labelClass = variant === 'dark' ? 'bg-white/10 text-emerald-400 border-white/5' : 'bg-slate-50 text-slate-500 border-slate-100';

  return (
    <div className={`group flex flex-col md:flex-row items-center gap-4 p-4 md:p-3 rounded-3xl border transition-all ${bgClass}`}>
      <div className="relative flex items-center gap-2 flex-shrink-0 min-w-[120px] no-print">
        <button 
          onClick={() => setIsEditT(!isEditT)} 
          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 border transition-colors ${isEditT ? 'bg-emerald-600 text-white border-emerald-600' : `${labelClass} hover:bg-white/20`}`}
        >
          {locationLabel} {match.tableNumber}
          <Edit2 size={10} />
        </button>
        <span className={`text-[9px] font-black bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-lg uppercase whitespace-nowrap border border-emerald-500/20`}>{infoLabel}</span>
        
        {isEditT && (
          <div className="absolute top-10 left-0 z-20 w-48 bg-slate-900 border border-white/10 shadow-2xl rounded-2xl p-3 animate-in fade-in zoom-in-95">
            <p className="text-[9px] font-black text-slate-400 uppercase mb-3 px-1">{locationLabel}</p>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: maxTables }).map((_, i) => {
                const num = i + 1;
                const isTaken = usedTables.has(num);
                const isCurrent = match.tableNumber === num;
                return (
                  <button
                    key={num}
                    onClick={() => { onUpdateTable(match.id, num); setIsEditT(false); }}
                    className={`w-full aspect-square flex items-center justify-center rounded-lg text-xs font-bold transition-all relative ${isCurrent ? 'bg-emerald-600 text-white' : isTaken ? 'bg-white/5 text-white/20' : 'bg-white/10 text-white hover:bg-emerald-500 hover:text-white border border-white/5'}`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 w-full flex items-center justify-between gap-4">
        <div className="flex-1 flex items-center justify-end gap-3 text-right overflow-hidden relative group/name">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onEditTeam(hId)}
              className="opacity-0 group-hover/name:opacity-100 p-1 text-white/40 hover:text-emerald-500 transition-all no-print"
              title="Editar Equipe"
            >
              <Settings2 size={12} />
            </button>
            <span className={`font-bold truncate text-sm md:text-base ${textClass}`}>{hName}</span>
          </div>
          <div className="relative">
            <TeamLogo logo={hLogo} className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0 bg-white/10 rounded-xl" />
            {isHomeWinner && <Zap size={14} className="absolute -top-1 -right-1 text-amber-500 fill-amber-500 animate-pulse" />}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(!match.isFinished || isEditingScore) ? (
            <>
              <input type="number" value={h} onChange={e => setH(e.target.value)} className="w-12 h-12 md:w-14 md:h-14 bg-white/10 text-white rounded-xl text-center font-black text-xl md:text-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-inner border border-white/10" />
              <span className="text-white/20 font-black text-sm">X</span>
              <input type="number" value={a} onChange={e => setA(e.target.value)} className="w-12 h-12 md:w-14 md:h-14 bg-white/10 text-white rounded-xl text-center font-black text-xl md:text-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-inner border border-white/10" />
            </>
          ) : (
            <div className="flex items-center gap-4 px-6 py-2 bg-white/10 rounded-2xl relative border border-white/5">
              <span className="text-2xl font-black text-white">{match.homeScore}</span>
              <span className="text-white/20 font-black">-</span>
              <span className="text-2xl font-black text-white">{match.awayScore}</span>
              {match.homeScore === match.awayScore && showAdvantage && match.advantageTeamId && (
                 <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-500 text-[7px] text-white px-2 py-0.5 rounded-full font-black uppercase shadow-lg">Vantagem</div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-start gap-3 overflow-hidden relative group/name">
          <div className="relative">
            <TeamLogo logo={aLogo} className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0 bg-white/10 rounded-xl" />
            {isAwayWinner && <Zap size={14} className="absolute -top-1 -left-1 text-amber-500 fill-amber-500 animate-pulse" />}
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-bold truncate text-sm md:text-base ${textClass}`}>{aName}</span>
            <button 
              onClick={() => onEditTeam(aId)}
              className="opacity-0 group-hover/name:opacity-100 p-1 text-white/40 hover:text-emerald-500 transition-all no-print"
              title="Editar Equipe"
            >
              <Settings2 size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto no-print">
        {(!match.isFinished || isEditingScore) ? (
          <div className="flex gap-1">
            <button 
              onClick={handleConfirm} 
              disabled={h===''||a===''} 
              className="px-4 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-500 disabled:opacity-20 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <CheckCircle2 size={14} /> <span className="hidden md:inline">SALVAR</span>
            </button>
            {isEditingScore && (
               <button onClick={() => { setIsEditingScore(false); setH(match.homeScore?.toString() || ''); setA(match.awayScore?.toString() || ''); }} className="p-3 text-white/40 hover:text-red-500 bg-white/5 rounded-xl transition-colors">
                <X size={14} />
               </button>
            )}
          </div>
        ) : (
          <button onClick={() => setIsEditingScore(true)} className="p-3 text-white/20 hover:text-emerald-500 hover:bg-white/5 rounded-xl transition-all">
            <Edit2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

const BracketView: React.FC<{ 
  tournament: Tournament, 
  resolveTeam: (id: string) => any, 
  onUpdateMatch: (id: string, h: number, a: number) => void,
  onEditTeam: (id: string) => void
}> = ({ tournament, resolveTeam, onUpdateMatch, onEditTeam }) => {
  const knockoutStages: Stage[] = ['ROUND_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'];
  const stagesInTournament = Array.from(new Set(tournament.matches.map(m => m.stage))).filter(s => knockoutStages.includes(s));
  const orderedStages = knockoutStages.filter(s => stagesInTournament.includes(s));
  
  const getStageMatches = (stage: Stage) => tournament.matches.filter(m => m.stage === stage);

  const splitMatches = (matches: Match[]) => {
    const half = Math.ceil(matches.length / 2);
    return [matches.slice(0, half), matches.slice(half)];
  };

  const finalMatch = getStageMatches('FINAL')[0];

  return (
    <div className="flex flex-row items-center justify-center gap-2 min-w-max pb-10 relative px-4">
      {/* Central "FINAL" Soccer Ball like in the vector */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-0 opacity-100 no-print">
         <div className="relative group/ball">
            <div className="absolute inset-0 bg-white blur-3xl opacity-30 group-hover/ball:opacity-50 transition-opacity"></div>
            <div className="relative w-32 h-32 md:w-40 md:h-40 bg-white rounded-full border-4 border-[#064e3b] flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.4)] overflow-hidden">
               {/* Simplified Soccer Ball Pattern with CSS */}
               <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-10">
                  {Array.from({length:9}).map((_,i)=><div key={i} className="border border-[#064e3b]"></div>)}
               </div>
               <span className="text-4xl">⚽</span>
               {/* Silver/White Band with "FINAL" text */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full bg-white/90 backdrop-blur-sm border-y-2 border-[#064e3b]/20 py-1 flex items-center justify-center shadow-md">
                 <span className="text-[#064e3b] font-black text-xs md:text-sm tracking-[0.4em] uppercase">FINAL</span>
               </div>
            </div>
            {/* Corner Flares */}
            <div className="absolute -top-10 -left-10 text-white animate-pulse text-2xl drop-shadow-lg">✦</div>
            <div className="absolute top-10 -right-12 text-white animate-bounce text-2xl drop-shadow-lg">✦</div>
         </div>
      </div>

      {/* Left Side */}
      <div className="flex flex-row items-center gap-1 md:gap-4 z-10">
        {orderedStages.filter(s => s !== 'FINAL').map((stage, idx) => {
          const [left] = splitMatches(getStageMatches(stage));
          return (
            <div key={`${stage}-left`} className="flex flex-col justify-around h-[500px] gap-2">
               <div className="flex flex-col flex-1 justify-around gap-2">
                  {left.map((m, i) => (
                    <BracketMatch 
                        key={m.id} 
                        match={m} 
                        resolveTeam={resolveTeam} 
                        onUpdate={onUpdateMatch} 
                        onEditTeam={onEditTeam} 
                        showAdvantage={tournament.useKnockoutAdvantage} 
                        side="left" 
                    />
                  ))}
               </div>
            </div>
          );
        })}
      </div>

      {/* Center Match finalists placeholder (handled by absolute positioning of ball, matches just need gap) */}
      <div className="w-32 md:w-56"></div>

      {/* Right Side */}
      <div className="flex flex-row-reverse items-center gap-1 md:gap-4 z-10">
        {orderedStages.filter(s => s !== 'FINAL').map((stage, idx) => {
          const [, right] = splitMatches(getStageMatches(stage));
          return (
            <div key={`${stage}-right`} className="flex flex-col justify-around h-[500px] gap-2">
               <div className="flex flex-col flex-1 justify-around gap-2">
                  {right.map((m, i) => (
                    <BracketMatch 
                        key={m.id} 
                        match={m} 
                        resolveTeam={resolveTeam} 
                        onUpdate={onUpdateMatch} 
                        onEditTeam={onEditTeam} 
                        showAdvantage={tournament.useKnockoutAdvantage} 
                        side="right" 
                    />
                  ))}
               </div>
            </div>
          );
        })}
      </div>

      {/* Actual Final Match Rendered over the ball (or slightly shifted) */}
      {finalMatch && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-32 z-20">
          <BracketMatch 
             match={finalMatch} 
             resolveTeam={resolveTeam} 
             onUpdate={onUpdateMatch} 
             onEditTeam={onEditTeam} 
             showAdvantage={tournament.useKnockoutAdvantage} 
             side="final"
          />
        </div>
      )}
    </div>
  );
};

const BracketMatch: React.FC<{ 
  match: Match, 
  resolveTeam: (id: string) => any, 
  onUpdate: any, 
  onEditTeam: (id: string) => void,
  showAdvantage?: boolean,
  side: 'left' | 'right' | 'final'
}> = ({ match, resolveTeam, onUpdate, onEditTeam, showAdvantage, side }) => {
  const home = resolveTeam(match.homeTeamId);
  const away = resolveTeam(match.awayTeamId);
  const [h, setH] = useState(match.homeScore?.toString() || '');
  const [a, setA] = useState(match.awayScore?.toString() || '');
  const [isEditing, setIsEditing] = useState(false);

  const save = () => {
    onUpdate(match.id, parseInt(h), parseInt(a));
    setIsEditing(false);
  };

  const isHomeWinner = match.isFinished && (match.homeScore! > match.awayScore! || (match.homeScore === match.awayScore && showAdvantage && match.advantageTeamId === match.homeTeamId));
  const isAwayWinner = match.isFinished && (match.awayScore! > match.homeScore! || (match.homeScore === match.awayScore && showAdvantage && match.advantageTeamId === match.awayTeamId));

  const isFinal = side === 'final';

  // NEW TEAM BOX INSPIRED BY VECTOR
  // White rectangular box with a slanted green header/tag at the end
  const TeamBox = ({ team, score, isWinner, alignLeft }: any) => (
    <div className={`relative w-44 h-11 bg-white flex items-center shadow-lg transition-all hover:scale-105 group/team ${alignLeft ? 'rounded-r-sm' : 'rounded-l-sm flex-row-reverse'}`}>
       {/* Dark Green Header Tag */}
       <div className={`absolute top-0 bottom-0 w-8 bg-[#064e3b] flex items-center justify-center text-white ${alignLeft ? 'left-0' : 'right-0'}`}>
          <div className="w-1.5 h-1.5 bg-white/40 rotate-45"></div>
       </div>

       {/* Team Name and Logo */}
       <div className={`flex-1 flex items-center gap-2 px-10 ${alignLeft ? 'pl-10' : 'pr-10 text-right flex-row-reverse'}`}>
          <TeamLogo logo={team.logo} className="w-5 h-5 flex-shrink-0" />
          <span className="text-[10px] font-black text-[#064e3b] uppercase truncate leading-none">{team.name}</span>
       </div>

       {/* Score Indicator - box at the edge */}
       <div className={`absolute top-0 bottom-0 w-10 flex items-center justify-center font-black text-sm bg-slate-100 border-[#064e3b]/10 ${alignLeft ? 'right-0 border-l' : 'left-0 border-r'} ${isWinner ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'}`}>
         {match.isFinished ? score : '-'}
       </div>

       {/* Advantage marker */}
       {isWinner && showAdvantage && match.homeScore === match.awayScore && (
         <div className={`absolute -top-1 w-2 h-2 bg-amber-400 rounded-full shadow-[0_0_5px_rgba(251,191,36,1)] ${alignLeft ? 'left-2' : 'right-2'}`}></div>
       )}
    </div>
  );

  if (isFinal) {
    return (
      <div className="flex flex-col items-center gap-2 group/final scale-110">
        <TeamBox team={home} score={match.homeScore} isWinner={isHomeWinner} alignLeft={true} />
        <div className="h-0.5 w-8 bg-white/40"></div>
        <TeamBox team={away} score={match.awayScore} isWinner={isAwayWinner} alignLeft={false} />

        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 opacity-0 group-hover/final:opacity-100 transition-opacity">
           {isEditing ? (
             <div className="flex items-center gap-1 bg-white p-1 rounded-md shadow-xl border">
                <input type="number" value={h} onChange={e => setH(e.target.value)} className="w-8 h-8 border rounded text-center text-xs font-bold text-[#064e3b]" />
                <button onClick={save} className="px-3 py-1 bg-[#064e3b] text-white text-[10px] font-black rounded">OK</button>
                <input type="number" value={a} onChange={e => setA(e.target.value)} className="w-8 h-8 border rounded text-center text-xs font-bold text-[#064e3b]" />
             </div>
           ) : (
             <button onClick={() => setIsEditing(true)} className="px-4 py-1.5 bg-white text-[#064e3b] text-[10px] font-black rounded-full shadow-2xl border-2 border-[#064e3b]/20 hover:bg-slate-50">EDITAR PLACAR</button>
           )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col gap-0.5 group/match ${side === 'right' ? 'items-end' : ''}`}>
      <TeamBox team={home} score={match.homeScore} isWinner={isHomeWinner} alignLeft={side === 'left'} />
      <TeamBox team={away} score={match.awayScore} isWinner={isAwayWinner} alignLeft={side === 'left'} />
      
      {/* Simple White Connector Lines */}
      <div className={`absolute top-1/2 h-[1px] bg-white/40 w-8 md:w-12 ${side === 'left' ? '-right-8 md:-right-12' : '-left-8 md:-left-12'}`}></div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/match:opacity-100 transition-opacity z-20">
         {isEditing ? (
            <div className="bg-white p-1 rounded-md shadow-xl border flex gap-1 items-center">
               <input type="number" value={h} onChange={e => setH(e.target.value)} className="w-6 h-6 text-[10px] border rounded text-center text-[#064e3b]" />
               <input type="number" value={a} onChange={e => setA(e.target.value)} className="w-6 h-6 text-[10px] border rounded text-center text-[#064e3b]" />
               <button onClick={save} className="bg-[#064e3b] text-white text-[8px] px-2 py-1 rounded">SALVAR</button>
            </div>
         ) : (
            <button onClick={() => setIsEditing(true)} className="w-8 h-8 bg-[#064e3b] text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform"><Edit2 size={12}/></button>
         )}
      </div>
    </div>
  );
};

const StandingsView: React.FC<{ 
  teams: Team[], 
  tournament: Tournament, 
  compact?: boolean,
  variant?: 'light' | 'dark',
  highlightCount?: number
}> = ({ teams, tournament, compact, variant = 'light', highlightCount }) => {
  const sorted = sortTeams(teams, tournament.tieBreakRules, tournament.matches);
  
  if (variant === 'dark') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <thead className="text-white uppercase text-[10px] font-black tracking-[0.2em] border-b border-white/20 pb-4">
            <tr>
              <th className="py-4 pl-4 pr-1 w-12">POS</th>
              <th className="py-4 px-1 w-40">EQUIPE</th>
              <th className="py-4 px-4 text-center w-14">PTS</th>
              <th className="py-4 px-4 text-center w-12">J</th>
              <th className="py-4 px-4 text-center w-12">V</th>
              <th className="py-4 px-4 text-center w-12">E</th>
              <th className="py-4 px-4 text-center w-12">D</th>
              <th className="py-4 px-4 text-center w-12">GP</th>
              <th className="py-4 px-4 text-center w-12">GC</th>
              <th className="py-4 px-4 text-center w-14">SG</th>
              <th className="py-4 px-4 text-center w-16">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((t, i) => {
              const isAdvanced = highlightCount !== undefined && i < highlightCount;
              return (
                <tr key={t.id} className={`${isAdvanced ? 'text-emerald-400' : 'text-slate-300'} hover:bg-white/5 transition-colors group`}>
                  <td className="py-5 pl-4 pr-1 font-black italic">{i + 1}º</td>
                  <td className="py-5 px-1">
                    <div className="flex items-center gap-3">
                      <TeamLogo logo={t.logoUrl} className="w-8 h-8 rounded-lg group-hover:scale-110 transition-transform" />
                      <span className="font-bold uppercase tracking-tight">{t.name}</span>
                    </div>
                  </td>
                  <td className="py-5 px-4 text-center font-black text-xl">{t.points}</td>
                  <td className="py-5 px-4 text-center font-bold">{t.played}</td>
                  <td className="py-5 px-4 text-center font-bold">{t.won}</td>
                  <td className="py-5 px-4 text-center font-bold opacity-60">{t.drawn}</td>
                  <td className="py-5 px-4 text-center font-bold opacity-60">{t.lost}</td>
                  <td className="py-5 px-4 text-center font-bold">{t.goalsFor}</td>
                  <td className="py-5 px-4 text-center font-bold">{t.goalsAgainst}</td>
                  <td className="py-5 px-4 text-center font-bold">{t.goalsFor - t.goalsAgainst}</td>
                  <td className="py-5 px-4 text-center font-bold opacity-60">{t.played > 0 ? ((t.points / (t.played * 3)) * 100).toFixed(1) : '0.0'}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const cellClass = compact ? "py-4 text-[10px]" : "py-5 text-sm";
  const horizontalPaddingClass = compact ? "px-2" : "px-6";

  return (
    <div className="bg-white rounded-sm border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] font-black tracking-widest border-b">
            <tr>
              <th className={`${cellClass} pl-4 pr-1 w-12`}>Pos</th>
              <th className={`${cellClass} pl-1 pr-4 w-40`}>Equipe</th>
              <th className={`${cellClass} ${horizontalPaddingClass} text-center w-14`}>Pts</th>
              <th className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>J</th>
              <th className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>V</th>
              <th className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>E</th>
              <th className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>D</th>
              <th className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>GP</th>
              <th className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>GC</th>
              <th className={`${cellClass} ${horizontalPaddingClass} text-center w-14`}>SG</th>
              <th className={`${cellClass} ${horizontalPaddingClass} text-center w-16`}>%</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((t, i) => {
              const isAdvanced = highlightCount !== undefined && i < highlightCount;
              return (
                <tr key={t.id} className={`${isAdvanced ? 'bg-emerald-50/20' : ''} hover:bg-slate-50 transition-colors`}>
                  <td className={`${cellClass} pl-4 pr-1 text-slate-400 font-bold w-12 whitespace-nowrap`}>{i + 1}º</td>
                  <td className={`${cellClass} pl-1 pr-4 font-black text-slate-800 truncate`}>
                    <div className="flex items-center gap-2">
                      <TeamLogo logo={t.logoUrl} className="w-6 h-6 text-sm flex-shrink-0" />
                      <span className="truncate">{t.name}</span>
                    </div>
                  </td>
                  <td className={`${cellClass} ${horizontalPaddingClass} text-center font-black text-emerald-600 bg-emerald-50/30 w-14`}>{t.points}</td>
                  <td className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>{t.played}</td>
                  <td className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>{t.won}</td>
                  <td className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>{t.drawn}</td>
                  <td className={`${cellClass} ${horizontalPaddingClass} text-center w-12`}>{t.lost}</td>
                  <td className={`${cellClass} ${horizontalPaddingClass} text-center text-slate-500 font-medium w-12`}>{t.goalsFor}</td>
                  <td className={`${cellClass} ${horizontalPaddingClass} text-center text-slate-500 font-medium w-12`}>{t.goalsAgainst}</td>
                  <td className={`${cellClass} ${horizontalPaddingClass} text-center font-bold text-slate-700 w-14`}>{t.goalsFor - t.goalsAgainst}</td>
                  <td className={`${cellClass} ${horizontalPaddingClass} text-center font-bold text-slate-400 w-16`}>{t.played > 0 ? ((t.points / (t.played * 3)) * 100).toFixed(1) : '0.0'}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const NavItem: React.FC<{ icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${active ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-900/40' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>
    {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 20 }) : icon} <span className="font-bold text-sm tracking-tight">{label}</span>
  </button>
);

export default App;