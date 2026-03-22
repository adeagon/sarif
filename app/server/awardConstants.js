// Server-side subset of award constants shared with the evaluator

export const PROGRAMS = {
  flyingblue:     { name: 'Flying Blue',             transferFrom: ['Amex MR', 'Chase UR'] },
  aeroplan:       { name: 'Aeroplan',                transferFrom: ['Amex MR', 'Chase UR'] },
  aircanada:      { name: 'Aeroplan',                transferFrom: ['Amex MR', 'Chase UR'] },
  united:         { name: 'United MileagePlus',      transferFrom: ['Chase UR'] },
  lifemiles:      { name: 'Avianca LifeMiles',       transferFrom: ['Amex MR', 'Chase UR'] },
  delta:          { name: 'Delta SkyMiles',          transferFrom: ['Amex MR'] },
  american:       { name: 'AAdvantage',              transferFrom: [] },
  british:        { name: 'British Avios',           transferFrom: ['Amex MR', 'Chase UR'] },
  virginatlantic: { name: 'Virgin Atlantic',         transferFrom: ['Amex MR', 'Chase UR'] },
  virgin:         { name: 'Virgin Atlantic',         transferFrom: ['Amex MR', 'Chase UR'] },
  emirates:       { name: 'Emirates Skywards',       transferFrom: ['Amex MR', 'Chase UR'] },
  turkish:        { name: 'Turkish Miles&Smiles',    transferFrom: [] },
  lufthansa:      { name: 'Lufthansa Miles&More',    transferFrom: ['Amex MR'] },
  singapore:      { name: 'Singapore KrisFlyer',     transferFrom: ['Amex MR', 'Chase UR'] },
  alaska:         { name: 'Alaska Mileage Plan',     transferFrom: [] },
  cathay:         { name: 'Asia Miles (Cathay)',     transferFrom: ['Amex MR', 'Chase UR'] },
  smiles:         { name: 'GOL Smiles',              transferFrom: ['Amex MR'] },
  eurobonus:      { name: 'SAS EuroBonus',           transferFrom: ['Amex MR'] },
  iberia:         { name: 'Iberia Avios',            transferFrom: ['Amex MR', 'Chase UR'] },
  airindia:       { name: 'Air India Flying Returns',transferFrom: ['Amex MR'] },
  jetblue:        { name: 'JetBlue TrueBlue',        transferFrom: ['Amex MR', 'Chase UR'] },
  finnair:        { name: 'Finnair Plus',            transferFrom: ['Amex MR'] },
  etihad:         { name: 'Etihad Guest',            transferFrom: ['Amex MR'] },
  velocity:       { name: 'Virgin Australia Velocity',transferFrom: [] },
  copa:           { name: 'Copa ConnectMiles',       transferFrom: [] },
  azul:           { name: 'Azul TudoAzul',           transferFrom: ['Amex MR'] },
};

export const TRANSFER_TO_KEYS = {
  'Amex Membership Rewards': ['flyingblue','aeroplan','lifemiles','british','virginatlantic','emirates','singapore','delta','lufthansa','etihad','finnair','iberia','jetblue','airindia','azul','eurobonus'],
  'Chase Ultimate Rewards':  ['flyingblue','aeroplan','united','british','virginatlantic','emirates','singapore','iberia','jetblue'],
  'Citi ThankYou Points':    ['flyingblue','aeroplan','lifemiles','turkish','singapore','jetblue','cathay'],
  'Capital One Miles':       ['flyingblue','aeroplan','turkish','singapore','british','finnair','cathay','lifemiles','eurobonus'],
  'Bilt Rewards':            ['flyingblue','aeroplan','united','british','virginatlantic','emirates','singapore','alaska','iberia'],
};
