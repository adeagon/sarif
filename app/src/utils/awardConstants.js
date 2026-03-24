// Shared award program constants — used by AwardSearch and AlertManager

export const PROGRAMS = {
  flyingblue:     { name: 'Flying Blue',               transferFrom: ['Amex MR', 'Chase UR'], bookUrl: 'https://www.flyingblue.com' },
  aeroplan:       { name: 'Aeroplan',                  transferFrom: ['Amex MR', 'Chase UR'], bookUrl: 'https://aeroplan.com' },
  aircanada:      { name: 'Aeroplan',                  transferFrom: ['Amex MR', 'Chase UR'], bookUrl: 'https://aeroplan.com' },
  united:         { name: 'United MileagePlus',        transferFrom: ['Chase UR'],            bookUrl: 'https://www.united.com' },
  lifemiles:      { name: 'Avianca LifeMiles',         transferFrom: ['Amex MR'],             bookUrl: 'https://www.lifemiles.com' },
  delta:          { name: 'Delta SkyMiles',            transferFrom: ['Amex MR'],             bookUrl: 'https://www.delta.com' },
  american:       { name: 'AAdvantage',                transferFrom: [],                      bookUrl: 'https://www.aa.com' },
  british:        { name: 'British Avios',             transferFrom: ['Amex MR', 'Chase UR'], bookUrl: 'https://www.britishairways.com' },
  virginatlantic: { name: 'Virgin Atlantic',           transferFrom: ['Amex MR', 'Chase UR'], bookUrl: 'https://www.virginatlantic.com' },
  virgin:         { name: 'Virgin Atlantic',           transferFrom: ['Amex MR', 'Chase UR'], bookUrl: 'https://www.virginatlantic.com' },
  emirates:       { name: 'Emirates Skywards',         transferFrom: ['Amex MR'],             bookUrl: 'https://www.emirates.com' },
  turkish:        { name: 'Turkish Miles&Smiles',      transferFrom: [],                      bookUrl: 'https://www.turkishairlines.com' },
  lufthansa:      { name: 'Lufthansa Miles&More',      transferFrom: ['Amex MR'],             bookUrl: 'https://www.miles-and-more.com' },
  singapore:      { name: 'Singapore KrisFlyer',       transferFrom: ['Amex MR', 'Chase UR'], bookUrl: 'https://www.singaporeair.com' },
  alaska:         { name: 'Alaska Mileage Plan',       transferFrom: [],                      bookUrl: 'https://www.alaskaair.com' },
  cathay:         { name: 'Asia Miles (Cathay)',       transferFrom: ['Amex MR'],             bookUrl: 'https://www.cathaypacific.com' },
  smiles:         { name: 'GOL Smiles',                transferFrom: [],                      bookUrl: 'https://www.smiles.com.br' },
  eurobonus:      { name: 'SAS EuroBonus',             transferFrom: ['Amex MR'],             bookUrl: 'https://www.flysas.com' },
  iberia:         { name: 'Iberia Avios',              transferFrom: ['Amex MR', 'Chase UR'], bookUrl: 'https://www.iberia.com' },
  airindia:       { name: 'Air India Flying Returns',  transferFrom: ['Amex MR'],             bookUrl: 'https://www.airindia.com/flying-returns' },
  jetblue:        { name: 'JetBlue TrueBlue',          transferFrom: ['Amex MR', 'Chase UR'], bookUrl: 'https://www.jetblue.com/trueblue' },
  finnair:        { name: 'Finnair Plus',              transferFrom: [],                      bookUrl: 'https://www.finnair.com/finnairplus' },
  etihad:         { name: 'Etihad Guest',              transferFrom: ['Amex MR'],             bookUrl: 'https://www.etihad.com/etihadguest' },
  velocity:       { name: 'Virgin Australia Velocity', transferFrom: [],                      bookUrl: 'https://www.virginaustralia.com/velocity' },
  copa:           { name: 'Copa ConnectMiles',         transferFrom: [],                      bookUrl: 'https://www.copaair.com/connectmiles' },
  azul:           { name: 'Azul TudoAzul',             transferFrom: ['Amex MR'],             bookUrl: 'https://www.voeazul.com.br/tudoazul' },
  qantas:         { name: 'Qantas',                    transferFrom: ['Amex MR'],             bookUrl: 'https://www.qantas.com' },
  qatar:          { name: 'Qatar Airways',              transferFrom: ['Amex MR'],             bookUrl: 'https://www.qatarairways.com' },
  ethiopian:      { name: 'Ethiopian Airlines',         transferFrom: [],                      bookUrl: 'https://www.ethiopianairlines.com' },
};

// IATA carrier code → readable name
export const CARRIERS = {
  AF: 'Air France', KL: 'KLM', OS: 'Austrian', LH: 'Lufthansa', LX: 'Swiss',
  SN: 'Brussels Airlines', AY: 'Finnair', SK: 'SAS', LO: 'LOT Polish',
  TP: 'TAP Portugal', IB: 'Iberia', VY: 'Vueling', VS: 'Virgin Atlantic',
  BA: 'British Airways', FR: 'Ryanair', U2: 'easyJet', W6: 'Wizz Air',
  CL: 'Lufthansa CityLine', EN: 'Air Dolomiti', EW: 'Eurowings', DE: 'Condor',
  BT: 'Air Baltic', WK: 'Edelweiss', '2L': 'Helvetic', LG: 'Luxair',
  PC: 'Pegasus', A3: 'Aegean', OA: 'Olympic', PS: 'UIA', RO: 'TAROM',
  '4U': 'Germanwings', X3: 'TUI fly', TF: 'Braathens',
  AC: 'Air Canada', UA: 'United', DL: 'Delta', AA: 'American', B6: 'JetBlue',
  WN: 'Southwest', AS: 'Alaska', WS: 'WestJet', NK: 'Spirit', F9: 'Frontier',
  Z0: 'Norse Atlantic', LY: 'El Al',
  TK: 'Turkish', EK: 'Emirates', EY: 'Etihad', QR: 'Qatar',
  SV: 'Saudi', GF: 'Gulf Air', WY: 'Oman Air', ME: 'MEA',
  RJ: 'Royal Jordanian', MS: 'EgyptAir', ET: 'Ethiopian', KQ: 'Kenya',
  SQ: 'Singapore', NH: 'ANA', JL: 'Japan', CX: 'Cathay',
  KE: 'Korean Air', OZ: 'Asiana', TG: 'Thai', GA: 'Garuda',
  MH: 'Malaysia', CI: 'China Airlines', CA: 'Air China',
  CZ: 'China Southern', MU: 'China Eastern', AI: 'Air India',
  VN: 'Vietnam', BR: 'EVA Air', '5J': 'Cebu Pacific',
  AV: 'Avianca', LA: 'LATAM', G3: 'Gol', AR: 'Aerolíneas', CM: 'Copa',
  AM: 'Aeromexico', Y4: 'Volaris',
};

export const CABINS = [
  { key: 'J', label: 'Business' },
  { key: 'W', label: 'Premium Eco' },
  { key: 'Y', label: 'Economy' },
  { key: 'F', label: 'First' },
];

// Maps user-facing program names to seats.aero source keys
export const PROGRAM_KEY_MAP = {
  'United MileagePlus':          'united',
  'Delta SkyMiles':              'delta',
  'American AAdvantage':         'american',
  'British Airways Avios':       'british',
  'Aeroplan':                    'aeroplan',
  'Air Canada Aeroplan':         'aeroplan',
  'Flying Blue':                 'flyingblue',
  'Virgin Atlantic':             'virginatlantic',
  'Virgin Atlantic Flying Club': 'virginatlantic',
  'Emirates Skywards':           'emirates',
  'Singapore KrisFlyer':         'singapore',
  'Turkish Miles&Smiles':        'turkish',
  'Avianca LifeMiles':           'lifemiles',
  'Alaska Mileage Plan':         'alaska',
  'Iberia Avios':                'iberia',
  'Finnair Plus':                'finnair',
  'Etihad Guest':                'etihad',
  'Qantas':                      'qantas',
  'Qatar Airways':               'qatar',
  'Ethiopian Airlines':          'ethiopian',
};

// Transferable currencies → seats.aero program keys
export const TRANSFER_TO_KEYS = {
  'Amex Membership Rewards': ['flyingblue','aeroplan','lifemiles','british','virginatlantic','emirates','singapore','delta','etihad','cathay','iberia','jetblue','qantas','qatar'],
  'Chase Ultimate Rewards':  ['flyingblue','aeroplan','united','british','virginatlantic','singapore','iberia','jetblue'],
  'Citi ThankYou Points':    ['flyingblue','aeroplan','lifemiles','turkish','singapore','jetblue','cathay'],
  'Capital One Miles':       ['flyingblue','aeroplan','turkish','singapore','british','finnair','cathay','lifemiles','eurobonus'],
  'Bilt Rewards':            ['flyingblue','aeroplan','united','british','virginatlantic','emirates','singapore','alaska','iberia'],
};

export function parseAirlines(raw) {
  if (!raw) return [];
  return raw.split(',').map(code => {
    const trimmed = code.trim();
    return { code: trimmed, name: CARRIERS[trimmed] || trimmed };
  });
}

export function bookLink(source, orig, dest) {
  switch (source) {
    case 'united':         return `https://www.united.com/en/us/flights/book/options?f=${orig}&t=${dest}&tripType=oneWay&cabinType=business`;
    case 'flyingblue':     return 'https://www.airfrance.com/';
    case 'aeroplan':
    case 'aircanada':      return 'https://aeroplan.com/';
    case 'lifemiles':      return 'https://www.lifemiles.com/';
    case 'virginatlantic':
    case 'virgin':         return 'https://www.virginatlantic.com/';
    case 'british':        return 'https://www.britishairways.com/';
    case 'lufthansa':      return 'https://www.miles-and-more.com/';
    case 'delta':          return 'https://www.delta.com/';
    case 'american':       return 'https://www.aa.com/';
    case 'turkish':        return 'https://www.turkishairlines.com/';
    case 'emirates':       return 'https://www.emirates.com/';
    case 'singapore':      return 'https://www.singaporeair.com/';
    case 'eurobonus':      return 'https://www.flysas.com/';
    default:               return PROGRAMS[source]?.bookUrl || '#';
  }
}

export function fmt(miles) {
  if (!miles || miles === 0) return null;
  return (miles / 1000).toFixed(1).replace('.0', '') + 'k';
}

export function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtTaxes(raw) {
  if (!raw) return null;
  return '$' + Math.round(raw / 100);
}

export function cppColor(cpp) {
  if (cpp >= 8) return { text: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', label: 'Excellent' };
  if (cpp >= 6) return { text: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30',       label: 'Good' };
  if (cpp >= 4) return { text: 'text-yellow-400',  bg: 'bg-yellow-500/15 border-yellow-500/30',   label: 'OK' };
  return          { text: 'text-red-400',    bg: 'bg-red-500/15 border-red-500/30',       label: 'Poor — consider cash' };
}
