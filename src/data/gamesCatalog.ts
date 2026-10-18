import { GameItem } from '../types';

export const USER_INSTALLED_GAMES: GameItem[] = [
  // Popular installed titles (generic fallback if offline before auto-scanner runs)
  { id: 'poe2', name: 'Path of Exile 2', is_installed: true, has_drops: true, category: 'ARPG / PC' },
  { id: 'hunt1896', name: 'Hunt: Showdown 1896', is_installed: true, has_drops: true, category: 'Shooter / PC' },
  { id: 'nomansky', name: "No Man's Sky", is_installed: true, has_drops: true, category: 'Survival / PC' },
  { id: 'witcher3', name: 'The Witcher 3: Wild Hunt', is_installed: true, has_drops: true, category: 'RPG / PC' },
  { id: 'frostpunk2', name: 'Frostpunk 2', is_installed: true, has_drops: false, category: 'Strategy / PC' },
  { id: 'inzoi', name: 'inZOI', is_installed: true, has_drops: false, category: 'Simulation / PC' },
  { id: 'hades2', name: 'Hades II', is_installed: true, has_drops: false, category: 'Roguelike / PC' },
  { id: 'zomboid', name: 'Project Zomboid', is_installed: true, has_drops: false, category: 'Survival / PC' },
  { id: 'hogwarts', name: 'Hogwarts Legacy', is_installed: true, has_drops: false, category: 'RPG / PC' },
  { id: 'stellaris', name: 'Stellaris', is_installed: true, has_drops: false, category: 'Strategy / PC' },
  { id: 'terraria', name: 'Terraria', is_installed: true, has_drops: false, category: 'Sandbox / PC' },
  { id: 'cyberpunk', name: 'Cyberpunk 2077', is_installed: true, has_drops: true, category: 'RPG / PC' },
  { id: 'rust', name: 'Rust', is_installed: true, has_drops: true, category: 'Survival / PC' }
];

export const GLOBAL_TWITCH_DROPS_GAMES: GameItem[] = [
  { id: 'rust', name: 'Rust', is_installed: false, has_drops: true, category: 'Survival / Twitch Drops' },
  { id: 'wot', name: 'World of Tanks', is_installed: false, has_drops: true, category: 'Vehicular Combat / Twitch Drops' },
  { id: 'wows', name: 'World of Warships', is_installed: false, has_drops: true, category: 'Naval MMO / Twitch Drops' },
  { id: 'pubg', name: 'PUBG: BATTLEGROUNDS', is_installed: false, has_drops: true, category: 'Battle Royale / Twitch Drops' },
  { id: 'deadbydaylight', name: 'Dead by Daylight', is_installed: false, has_drops: true, category: 'Asymmetric Horror / Twitch Drops' },
  { id: 'thefinals', name: 'THE FINALS', is_installed: false, has_drops: true, category: 'Shooter / Twitch Drops' },
  { id: 'spacemarine2', name: 'Warhammer 40,000: Space Marine II', is_installed: false, has_drops: true, category: 'Action / Twitch Drops' },
  { id: 'eveonline', name: 'EVE Online', is_installed: false, has_drops: true, category: 'Space MMO / Twitch Drops' },
  { id: 'albion', name: 'Albion Online', is_installed: false, has_drops: true, category: 'Sandbox MMO / Twitch Drops' },
  { id: 'deltaforce', name: 'Delta Force', is_installed: false, has_drops: true, category: 'Tactical Shooter / Twitch Drops' },
  { id: 'valorant', name: 'VALORANT', is_installed: false, has_drops: true, category: 'Tactical Shooter / Twitch Drops' },
  { id: 'starrail', name: 'Honkai: Star Rail', is_installed: false, has_drops: true, category: 'RPG / Twitch Drops' },
  { id: 'genshin', name: 'Genshin Impact', is_installed: false, has_drops: true, category: 'RPG / Twitch Drops' },
  { id: 'lol', name: 'League of Legends', is_installed: false, has_drops: true, category: 'MOBA / Twitch Drops' },
  { id: 'warframe', name: 'Warframe', is_installed: false, has_drops: true, category: 'Action MMO / Twitch Drops' },
  { id: 'eso', name: 'The Elder Scrolls Online', is_installed: false, has_drops: true, category: 'MMORPG / Twitch Drops' },
  { id: 'wutheringwaves', name: 'Wuthering Waves', is_installed: false, has_drops: true, category: 'Action RPG / Twitch Drops' },
  { id: 'marvelrivals', name: 'Marvel Rivals', is_installed: false, has_drops: true, category: 'Hero Shooter / Twitch Drops' },
  { id: 'eldenring', name: 'ELDEN RING', is_installed: false, has_drops: true, category: 'Action RPG / Twitch Drops' },
  { id: 'blackdesert', name: 'Black Desert', is_installed: false, has_drops: true, category: 'MMORPG / Twitch Drops' }
];

export const INITIAL_GAMES_DATABASE: GameItem[] = [
  ...USER_INSTALLED_GAMES,
  ...GLOBAL_TWITCH_DROPS_GAMES
];
