const STORAGE_KEY = 'bftsc_arcade_meta_v1';
const SLOT_KEY_PREFIX = 'bftsc_save_slot_v1_';

export function createMeta(){
  return {
    ip: 0,
    totalIpEarned: 0,
    legendaryUnlocked: false,
    // enable debug UI when true
    debugEnabled: true,
    partySlots: 3,
    // default owned starters for a fresh save
    ownedCards: ['meepo','cree_kid','erky_timbers'],
    ownedSummons: ['garon'],
    // AP per turn (can be increased via upgrades)
    apPerTurn: 3,
    // track purchased metagame upgrades by id
    purchasedUpgrades: [],
    // Stats
    runs: 0,
    encountersBeaten: 0,
    furthestReachedEnemy: null, // store enemy index or id
    characterUsage: {}, // map cardId -> times used
    summonUsage: {}, // map summonId -> times used
    totalSummonUsage: {}, // cumulative across runs
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
  // prerequisite: AP5 requires AP4 first
  if(upgrade.id === 'ap_5'){
    if(!(meta.purchasedUpgrades && meta.purchasedUpgrades.includes('ap_4'))){
      return { success:false, reason:'prereq' };
    }
  }
  if(meta.ip < upgrade.ip_cost) return { success:false, reason:'insufficient_ip' };
  meta.ip -= upgrade.ip_cost;
  if(upgrade.id === 'legendary_store') meta.legendaryUnlocked = true;
  if(upgrade.id && upgrade.id.startsWith('slot_')){
    // special case: unlock that grants +3 slots
    if(upgrade.id === 'slot_plus3') meta.partySlots += 3;
    else meta.partySlots += 1;
  }
  // Handle AP upgrades
  if(upgrade.id === 'ap_4') meta.apPerTurn = 4;
  if(upgrade.id === 'ap_5') meta.apPerTurn = 5;
  // record purchased upgrade id for UI state
  if(upgrade.id){ meta.purchasedUpgrades = meta.purchasedUpgrades || []; if(!meta.purchasedUpgrades.includes(upgrade.id)) meta.purchasedUpgrades.push(upgrade.id); }
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

// Save/load helper for numbered save slots (1-based index)
export function saveSlot(slotIndex, meta, name){
  try{
    if(!slotIndex || slotIndex < 1 || slotIndex > 3) return false;
    const payload = { meta: meta, savedAt: Date.now(), name: (typeof name === 'string' ? name : undefined) };
    localStorage.setItem(SLOT_KEY_PREFIX + String(slotIndex), JSON.stringify(payload));
    return true;
  }catch(e){ return false; }
}

export function loadSlot(slotIndex){
  try{
    if(!slotIndex || slotIndex < 1 || slotIndex > 3) return null;
    const raw = localStorage.getItem(SLOT_KEY_PREFIX + String(slotIndex));
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}

export function deleteSlot(slotIndex){
  try{
    if(!slotIndex || slotIndex < 1 || slotIndex > 3) return false;
    localStorage.removeItem(SLOT_KEY_PREFIX + String(slotIndex));
    return true;
  }catch(e){ return false; }
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
