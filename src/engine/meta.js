const STORAGE_KEY = 'vcg_meta_v1';

export function createMeta(){
  return {
    ip: 0,
    totalIpEarned: 0,
    legendaryUnlocked: false,
    // enable debug UI when true
    debugEnabled: false,
    partySlots: 3,
    ownedCards: [],
    ownedSummons: [],
    // Stats
    runs: 0,
    encountersBeaten: 0,
    furthestReachedEnemy: null, // store enemy index or id
    characterUsage: {}, // map cardId -> times used
    summonUsage: {}, // map summonId -> times used
    // enemy stats
    enemyDefeatCounts: {}, // map enemyId -> times defeated by player
    enemyVictoryCounts: {} // map enemyId -> times that enemy defeated the party
  };
}


export function saveMeta(meta){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); return true }catch(e){ return false }
}

export function loadMeta(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return createMeta();
    const parsed = JSON.parse(raw);
    return Object.assign(createMeta(), parsed);
  }catch(e){ return createMeta(); }
}

export function buyUpgrade(meta, upgrade){
  if(!upgrade) return { success:false };
  if(meta.ip < upgrade.ip_cost) return { success:false };
  meta.ip -= upgrade.ip_cost;
  if(upgrade.id === 'legendary_store') meta.legendaryUnlocked = true;
  if(upgrade.id && upgrade.id.startsWith('slot_')) meta.partySlots += 1;
  saveMeta(meta);
  return { success:true, meta };
}

export function buyLegendaryItem(meta, item){
  if(!item || typeof item.ip_cost !== 'number') return { success:false, reason:'invalid' };
  if(meta.ip < item.ip_cost) return { success:false, reason:'insufficient_ip' };
  meta.ip -= item.ip_cost;
  // determine whether item is card or summon by an explicit "kind" field, or fallback by presence of 'hp'
  if(item.kind === 'card' || item.hp){
    if(!meta.ownedCards.includes(item.id)) meta.ownedCards.push(item.id);
  } else {
    if(!meta.ownedSummons.includes(item.id)) meta.ownedSummons.push(item.id);
  }
  saveMeta(meta);
  return { success:true, meta };
}

// Set debug flag on/off and persist
export function setDebug(meta, enabled){
  if(!meta) return { success:false };
  meta.debugEnabled = !!enabled;
  saveMeta(meta);
  return { success:true, meta };
}

// Toggle debug flag and persist
export function toggleDebug(meta){
  if(!meta) return { success:false };
  meta.debugEnabled = !meta.debugEnabled;
  saveMeta(meta);
  return { success:true, meta };
}
