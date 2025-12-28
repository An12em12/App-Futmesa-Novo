
export interface Player {
  id: string;
  name: string;
  number: number;
}

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  group?: string;
  groupPos?: number; // Posição final no grupo para cálculo de vantagem
  players?: Player[]; // Novo campo para elenco
}

export type Stage = 'LEAGUE' | 'GROUP' | 'ROUND_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL';

export interface Match {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  round: number;
  tableNumber?: number;
  isFinished: boolean;
  stage: Stage;
  groupId?: string;
  advantageTeamId?: string; // ID da equipe que tem vantagem de empate
}

export type TournamentFormat = 'LEAGUE' | 'GROUPS_KNOCKOUT' | 'KNOCKOUT';

export type TieBreakRule = 
  | 'POINTS' 
  | 'GOAL_DIFF' 
  | 'GOALS_FOR' 
  | 'WINS' 
  | 'HEAD_TO_HEAD' 
  | 'H2H_GOAL_DIFF' 
  | 'H2H_GOALS_FOR' 
  | 'PERCENTAGE' 
  | 'AWAY_GOALS';

export type KnockoutLogic = 'OLYMPIC' | 'EFFICIENCY';

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  teams: Team[];
  matches: Match[];
  maxTables: number;
  locationLabel: string;
  createdAt: number;
  isFinished: boolean;
  slogan?: string;
  numGroups?: number;
  advanceCountPerGroup?: number;
  tieBreakRules: TieBreakRule[];
  useKnockoutAdvantage?: boolean;
  knockoutLogic?: KnockoutLogic; // Nova propriedade
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  MY_TOURNAMENTS = 'MY_TOURNAMENTS',
  CREATE = 'CREATE',
  TEAMS = 'TEAMS',
  MATCHES = 'MATCHES',
  STANDINGS = 'STANDINGS',
  TABLES = 'TABLES',
  FINAL_RANKING = 'FINAL_RANKING',
  GLOBAL_STANDINGS = 'GLOBAL_STANDINGS',
  BRACKET = 'BRACKET',
  PRINT = 'PRINT'
}
