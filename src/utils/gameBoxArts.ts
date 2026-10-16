/**
 * Sentinel Game Box Art Registry
 * High-resolution official Steam Library posters (600x900), Steam Headers (460x215),
 * and Twitch CDN box arts (285x380) for all priority games and catalog titles.
 * Audited against official Valve Steam Store & SteamDB APIs.
 */

const EDITION_NOISE = /\b(director'?s cut|remake|remastered|definitive edition|complete edition|goty|game of the year|edition|playtest|classic)\b/gi;

const ROMAN_MAP: Record<string, string> = {
  'ii': '2',
  'iii': '3',
  'iv': '4',
  'v': '5',
  'vi': '6',
  'vii': '7',
  'viii': '8'
};

/**
 * Verified Steam AppID Registry (Audited via Valve Store API)
 */
const STEAM_APP_MAP: Record<string, string> = {
  // --- Core Priority & Verified Games ---
  'hitman': '1659040',
  'hitman world of assassination': '1659040',
  'hunt: showdown': '594650',
  'hunt: showdown 1896': '594650',
  'the witcher 3': '292030',
  'the witcher 3: wild hunt': '292030',
  'witcher 3': '292030',
  'witcher': '292030',
  'warhammer 40,000: chaos gate': '1611910',
  'warhammer 40,000: chaos gate - daemonhunters': '1611910',
  'chaos gate': '1611910',
  'wardogs': '1247160',
  'wardogs: red\'s return': '1247160',
  'path of exile 2': '2694490',
  'poe 2': '2694490',
  'path of exile': '238960',
  'poe': '238960',
  'anno 117': '3274580',
  'anno 117: pax romana': '3274580',
  'age of wonders 4': '1669000',
  'against the storm': '1336490',
  'fishing planet': '380600',

  // --- Fixed Mismatches from Steam API Audit ---
  'the division 2': '2221490',
  'tom clancy\'s the division 2': '2221490',
  'division 2': '2221490',
  'dredge': '1562430',
  'dune: spice wars': '1605220',
  'skull and bones': '2853730',
  'steamworld build': '2134770',
  'warhammer 40,000: mechanicus 2': '2532480',
  'warhammer 40,000: mechanicus ii': '2532480',
  'mechanicus 2': '2532480',
  'mechanicus ii': '2532480',
  'moonlighter 2': '2350790',
  'moonlighter 2: the endless vault': '2350790',
  'endless legend 2': '3407390',
  'command & conquer': '1213210',
  'command & conquer remastered': '1213210',
  'command and conquer': '1213210',
  'black desert': '582660',

  // --- Verified Sequels with Official Steam Pages ---
  'battlefield 6': '2807960',
  'battlefield vi': '2807960',
  'jurassic world evolution 3': '2958130',
  'jurassic world evolution iii': '2958130',
  'planet zoo 2': '3219030',
  'planet zoo ii': '3219030',
  'graveyard keeper 2': '4358690',
  'graveyard keeper ii': '4358690',

  // --- Standard Priority & Catalog Games ---
  'space marine 2': '2183900',
  'space marine ii': '2183900',
  'warhammer 40,000: space marine 2': '2183900',
  'warhammer 40,000: space marine ii': '2183900',
  'darktide': '1361210',
  'warhammer 40,000: darktide': '1361210',
  'eve online': '8500',
  'plague tale': '752590',
  'a plague tale innocence': '752590',
  'jagged alliance 3': '1084160',
  'inzoi': '2456740',
  'jurassic world evolution': '648350',
  'jurassic world evolution 1': '648350',
  'jurassic world evolution 2': '1244460',
  'jurassic world evolution ii': '1244460',
  'kingdom rush 5': '2849080',
  'kingdom rush 5: alliance td': '2849080',
  'mewgenics': '686060',
  'necesse': '1169040',
  'oxygen not included': '457140',
  'pioneers of pagonia': '2155180',
  'rimworld': '294100',
  'phoenix point': '839770',
  'slay the spire 2': '2868840',
  'stardew valley': '413150',
  'starship troopers': '1202130',
  'starship troopers: terran command': '1202130',
  'stellaris': '281990',
  'terraria': '105600',
  'they are billions': '644930',
  'victoria 3': '529340',
  'xenonauts 2': '538030',
  'battlesector': '1295500',
  'warhammer 40,000: battlesector': '1295500',
  'project zomboid': '108600',
  'zomboid': '108600',
  'the lost crown': '2751000',
  'prince of persia: the lost crown': '2751000',
  'pathfinder': '1184370',
  'pathfinder: wrath of the righteous': '1184370',
  'hogwarts legacy': '990080',
  'hades 2': '1145350',
  'hades ii': '1145350',
  'hard west 2': '1282410',
  'heroes of might and magic: olden era': '3105440',
  'olden era': '3105440',
  'frostpunk': '323190',
  'frostpunk 1': '323190',
  'frostpunk 2': '1601580',
  'for the king 2': '1676840',
  'for the king ii': '1676840',
  'endzone 2': '2144640',
  'door kickers 2': '1239080',
  'deep rock galactic': '548430',
  'dead state': '239840',
  'cyberpunk 2077': '1091500',
  'crying suns': '873940',
  'crusader kings 3': '1158310',
  'crusader kings iii': '1158310',
  'cities: skylines 2': '949230',
  'cities: skylines ii': '949230',
  'cities skylines': '949230',
  'dungeons & dragons': '206480',
  'dungeons and dragons': '206480',
  'dungeons & dragons online': '206480',
  'battle brothers': '365360',
  'baldur\'s gate 3': '1086940',
  'avowed': '2457220',
  'armored core vi': '1888160',
  'apex legends': '1172470',
  'albion online': '761890',
  'rust': '252490',
  'world of warships': '552990',
  'desperados 3': '610370',
  'desperados iii': '610370',
  'cartel tycoon': '1220140',
  'arc raiders': '1808500',
  'battlefield': '1517290',
  'brawlhalla': '291550',
  'dayz': '221100',
  'elden ring': '1245620',
  'rainbow six': '359550',
  'rainbow six siege': '359550',
  'planet zoo': '703080',
  'planet zoo 1': '703080',
  'world of tanks': '1407200',
  'graveyard keeper': '599140',
  'graveyard keeper 1': '599140',
  'dragon\'s dogma 2': '2054970',
  'dragon\'s dogma ii': '2054970',
  'delta force': '2507950',
  'no man\'s sky': '275850',

  // --- Verified Installed PC Games ---
  'battletech': '637090',
  'beholder 3': '1570070',
  'red dead redemption 2': '1174180',
  'rdr 2': '1174180',
  'rdr2': '1174180',
  'resident evil 2': '883710',
  'resident evil 2 remake': '883710',
  'resident evil 3': '952060',
  'resident evil 3 remake': '952060',
  'resident evil 4': '2050650',
  'resident evil 4 remake': '2050650',
  'timberborn': '1062090',
  'death stranding': '1850570',
  'death stranding director cut': '1850570',
  'death stranding director\'s cut': '1850570',
  'stranded alien dawn': '1385900',
  'stranded: alien dawn': '1385900',
  'god of war': '1593500',
  'god of war ragnarok': '2322010',
  'god of war ragnarök': '2322010',
  'horizon zero dawn': '1151640',
  'horizon forbidden west': '2420110',
  'horizon forbidden west complete': '2420110',
  'marvel\'s midnight suns': '368260',
  'midnight suns': '368260',
  'assassin\'s creed valhalla': '2208920',
  'ac valhalla': '2208920',
  'marvel\'s spider-man remastered': '1817070',
  'spider-man remastered': '1817070',
  'marvel\'s spider-man: miles morales': '1817190',
  'spider-man miles morales': '1817190',
  'marvel\'s spider-man 2': '2651280',
  'spider-man 2': '2651280',
  'the last of us part i': '1888930',
  'the last of us part 1': '1888930',
  'the last of us part ii': '2531310',
  'the last of us part 2': '2531310',
  'need for speed unbound': '1846380',
  'nfs unbound': '1846380',
  'senua\'s saga: hellblade ii': '2461850',
  'hellblade 2': '2461850',
  'the alters': '1601570',
  'dungeons 4': '1643310',
  'shadow gambit the cursed crew': '1545560',
  'shadow gambit: the cursed crew': '1545560'
};

/**
 * Direct CDN Overrides: Non-Steam titles, Twitch IGDB posters,
 * and Steam V2 SHA-1 Content-Addressed Headers (Audited HTTP 200 OK)
 */
const DIRECT_OVERRIDE_MAP: Record<string, string[]> = {
  'battlefield 6': [
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2807960/library_600x900.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2807960/library_600x900.jpg',
    'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2807960/c12d12ce3c7d217398d3fcad77427bfc9d57c570/header.jpg',
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2807960/header.jpg'
  ],
  'jurassic world evolution 3': [
    'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2958130/df39f8c59232633e8e01ab63313b095402bdd0d5/header.jpg',
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2958130/header.jpg'
  ],
  'planet zoo 2': [
    'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3219030/a5131aa4b84d04a55e3b9c561d7c886cc22bbe1c/header.jpg',
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3219030/header.jpg'
  ],
  'graveyard keeper 2': [
    'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4358690/d63c37d6289ef7c48d89c0521fb82ac51d7f5ce8/header.jpg',
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4358690/header.jpg'
  ],
  'warhammer 40,000: mechanicus 2': [
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2532480/header.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2532480/header.jpg',
    'https://static-cdn.jtvnw.net/ttv-boxart/2028661472_IGDB-285x380.jpg'
  ],
  'warhammer 40,000: mechanicus ii': [
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2532480/header.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2532480/header.jpg',
    'https://static-cdn.jtvnw.net/ttv-boxart/2028661472_IGDB-285x380.jpg'
  ],
  'moonlighter 2': [
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2350790/header.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2350790/header.jpg',
    'https://static-cdn.jtvnw.net/ttv-boxart/1262047844_IGDB-285x380.jpg'
  ],
  'moonlighter 2: the endless vault': [
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2350790/header.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2350790/header.jpg',
    'https://static-cdn.jtvnw.net/ttv-boxart/1262047844_IGDB-285x380.jpg'
  ],
  'endless legend 2': [
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3407390/header.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/3407390/header.jpg',
    'https://static-cdn.jtvnw.net/ttv-boxart/1745534742_IGDB-285x380.jpg'
  ],
  'black desert': [
    'https://static-cdn.jtvnw.net/ttv-boxart/386821_IGDB-285x380.jpg',
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/582660/library_600x900.jpg',
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/582660/header.jpg'
  ],
  'defection': [
    'https://static-cdn.jtvnw.net/ttv-boxart/Defection-285x380.jpg'
  ],
  'aion 2': [
    'https://static-cdn.jtvnw.net/ttv-boxart/771448419_IGDB-285x380.jpg',
    'https://static-cdn.jtvnw.net/ttv-boxart/1660995166-285x380.jpg'
  ],
  'aion': [
    'https://static-cdn.jtvnw.net/ttv-boxart/1660995166-285x380.jpg',
    'https://static-cdn.jtvnw.net/ttv-boxart/771448419_IGDB-285x380.jpg'
  ],
  'aion classic': [
    'https://static-cdn.jtvnw.net/ttv-boxart/1660995166-285x380.jpg'
  ],
  'hearthstone': [
    'https://static-cdn.jtvnw.net/ttv-boxart/138585-285x380.jpg'
  ],
  'starcraft 2': [
    'https://static-cdn.jtvnw.net/ttv-boxart/490422-285x380.jpg'
  ],
  'starcraft ii': [
    'https://static-cdn.jtvnw.net/ttv-boxart/490422-285x380.jpg'
  ],
  'world of warcraft': [
    'https://static-cdn.jtvnw.net/ttv-boxart/18122-285x380.jpg'
  ],
  'wow': [
    'https://static-cdn.jtvnw.net/ttv-boxart/18122-285x380.jpg'
  ],
  'star citizen': [
    'https://static-cdn.jtvnw.net/ttv-boxart/71375-285x380.jpg'
  ]
};

/**
 * Normalizes title: strips diacritics, noise suffixes, Roman numerals, punctuation.
 */
export function normalizeKey(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip accents (Ragnarök -> Ragnarok)
    .toLowerCase()
    .replace(EDITION_NOISE, '')
    .replace(/[':;!?,.\-_/\\()\[\]&]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(tok => ROMAN_MAP[tok] || tok)
    .join(' ')
    .trim();
}

const SEQUEL_TOKENS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '1896', '2077']);

/**
 * Intelligent fuzzy matcher for game titles with strict sequel and word-boundary protection:
 * - Prevents substring false positives (e.g. 'hunt' NEVER matches 'daemonhunters')
 * - Prevents sequel bleeding (e.g. 'path of exile' NEVER matches 'path of exile 2')
 * - Supports optional "1" for base games (e.g. 'frostpunk 1' matches 'frostpunk')
 */
export function smartGameMatch(candidate: string, target: string): boolean {
  if (!candidate || !target) return false;
  const cNorm = normalizeKey(candidate);
  const tNorm = normalizeKey(target);

  // 1. Exact normalized match is always true
  if (cNorm === tNorm) return true;

  // Handle optional "1" (e.g. 'Frostpunk 1' === 'Frostpunk')
  if (cNorm.replace(/\s+1$/, '') === tNorm.replace(/\s+1$/, '')) {
    return true;
  }

  const cTokens = cNorm.split(' ').filter(Boolean);
  const tTokens = tNorm.split(' ').filter(Boolean);

  // 2. Strict Sequel Guard:
  // If either title contains a version/sequel number, they MUST match identically!
  const cSeq = cTokens.find(tok => SEQUEL_TOKENS.has(tok) && tok !== '1');
  const tSeq = tTokens.find(tok => SEQUEL_TOKENS.has(tok) && tok !== '1');
  if (cSeq !== tSeq) {
    return false;
  }

  // 3. Whole Word Token Subset Guard:
  // Checks that all tokens of the shorter title are present as WHOLE words in the longer title
  const cSet = new Set(cTokens);
  const tSet = new Set(tTokens);

  const isSubset = (shorter: string[], longerSet: Set<string>): boolean => {
    return shorter.length > 0 && shorter.every(tok => longerSet.has(tok));
  };

  if (cTokens.length <= tTokens.length && isSubset(cTokens, tSet)) {
    return true;
  }
  if (tTokens.length < cTokens.length && isSubset(tTokens, cSet)) {
    return true;
  }

  return false;
}

const DYNAMIC_BOX_ART_CACHE: Record<string, string> = {};

export function registerDynamicBoxArt(gameName: string, url: string): void {
  if (gameName && url) {
    DYNAMIC_BOX_ART_CACHE[normalizeKey(gameName)] = url;
  }
}

/**
 * Resolves an ordered list of authentic game box art sources
 * (Candidate URLs -> Exact Direct Overrides -> Exact Steam Maps -> Smart Matches)
 */
export function resolveGameBoxArtSources(
  gameName: string,
  candidateUrls: (string | undefined)[] = []
): string[] {
  const sources: string[] = [];
  const seen = new Set<string>();

  const add = (url?: string) => {
    if (url && typeof url === 'string' && url.trim().length > 0 && !url.includes('missing') && !seen.has(url)) {
      seen.add(url);
      sources.push(url);
    }
  };

  // 1. Add valid explicit candidate URLs first (from activeDrop or catalog)
  for (const url of candidateUrls) {
    add(url);
  }

  if (!gameName) return sources;
  const norm = normalizeKey(gameName);

  // 1.5 Dynamic box art cache (resolved from search or backend)
  if (DYNAMIC_BOX_ART_CACHE[norm]) {
    add(DYNAMIC_BOX_ART_CACHE[norm]);
  }

  // ==================== PASS 1: 100% EXACT MATCH FIRST ====================
  // 1. Direct verified overrides (V2 SHA-1 hashed headers or Twitch CDN)
  for (const [k, urls] of Object.entries(DIRECT_OVERRIDE_MAP)) {
    if (norm === normalizeKey(k)) {
      urls.forEach(add);
      break;
    }
  }

  // 2. Exact Steam App mapping
  let exactFound = false;
  for (const [k, appId] of Object.entries(STEAM_APP_MAP)) {
    if (norm === normalizeKey(k)) {
      add(`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`);
      add(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`);
      add(`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`);
      add(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`);
      exactFound = true;
      break;
    }
  }

  if (exactFound) {
    return sources;
  }

  // ==================== PASS 2: SMART MATCH WITH SEQUEL & TOKEN GUARD ====================
  // Direct overrides first
  const sortedDirect = Object.entries(DIRECT_OVERRIDE_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [k, urls] of sortedDirect) {
    if (smartGameMatch(gameName, k)) {
      urls.forEach(add);
      break;
    }
  }

  // Steam entries sorted from longest (most specific) to shortest
  const sortedSteamEntries = Object.entries(STEAM_APP_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [k, appId] of sortedSteamEntries) {
    if (smartGameMatch(gameName, k)) {
      add(`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`);
      add(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`);
      add(`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`);
      add(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`);
      break;
    }
  }

  return sources;
}

/**
 * Resolves a single high-resolution authentic game box art poster (backwards compatible)
 */
export function resolveGameBoxArt(
  gameName: string,
  candidateUrls: (string | undefined)[] = []
): string | undefined {
  const sources = resolveGameBoxArtSources(gameName, candidateUrls);
  return sources[0];
}
