import { AudioManager } from './audio.js';

export function startEncounter(enemyDef, deck, rng, opts={}){
  const enemy = { ...enemyDef };
  // ensure a stable maxHp value is present (data uses `hp` as the base HP)
  if(typeof enemy.maxHp !== 'number') enemy.maxHp = typeof enemy.hp === 'number' ? enemy.hp : (enemy.maxHp || null);
  const state = {
    enemy,
    rng,
    deck,
    turn:0,
    apPerTurn: opts.apPerTurn || 3,
    ap: opts.apPerTurn || 3,
    playfield: [null,null,null], // 0,1 front; 2 back
    summons: [],
    exhaustedThisEncounter: [],
    summonUsed: {},
    summonCooldowns: {}
    ,supportUsed: {}
    ,abilityCooldowns: {}
    ,pendingEffects: []
  };
  // Next unique instance id for placed heroes (used to key per-ability cooldowns)
  state._nextHeroInstanceId = 1;
  // Choose a random Griff image variant for this encounter (if needed by UI).
  try{
    const v = Math.floor(Math.random() * 7) + 1;
    state._griffVariant = v;
    state._griffImage = './assets/griff' + v + '.png';
  }catch(e){ state._griffVariant = null; state._griffImage = null; }
  // All character cards should already be provided in `deck.hand` by the deck builder.
  // Drawing has been removed — no action needed here.
  return state;
}

function _selectSingleTargetIndex(state, rng){
  // If special formations are active, handle their custom single-target
  // prioritization rules before falling back to general logic.
  try{
    const f = Number(state.formation);
    // Formation 3: always prefer slot 0, then slot 1, then slot 2.
    if(f === 3){
      if(state.playfield[0]) return 0;
      if(state.playfield[1]) return 1;
      if(state.playfield[2]) return 2;
      return -1;
    }
    // Formation 2: prefer slot 0; otherwise choose randomly between 1 and 2.
    if(f === 2){
      if(state.playfield[0]) return 0;
      const choices = [1,2].filter(i => state.playfield[i]);
      if(choices.length>0){
        return rng ? choices[rng.int(choices.length)] : choices[Math.floor(Math.random()*choices.length)];
      }
      return -1;
    }
  }catch(e){}

  // prefer a hero marked by support 'Help'
  const helpedIndex = state.playfield.findIndex(h => h && h.helped);
  if(helpedIndex !== -1) return helpedIndex;
  // prefer front-line heroes (0,1)
  const front = [0,1].filter(i=>state.playfield[i]).map(i=>i);
  if(front.length>0) return rng ? front[rng.int(front.length)] : front[Math.floor(Math.random()*front.length)];
  // otherwise target the back slot (2) if present
  if(state.playfield[2]) return 2;
  return -1;
}

function parseDamageFromAbility(card){
  // `card` may be either a card object or an ability-like object.
  const abilityObj = (card && typeof card === 'object' && (card.ability || card.abilities)) ? card : {};
  const text = (abilityObj.ability || (card && card.ability) || "") + "";
  const nums = (text||"").match(/(\d+)/g);
  if(!nums || nums.length === 0) return 0;
  // prefer the last numeric value in the ability text (handles "Cure Wounds (4th level): Restore 5 HP")
  return Number(nums[nums.length-1]);
}

// Helper to extract the primary ability object from a card definition.
function getPrimaryAbility(obj){
  if(!obj) return {};
  try{
    if(Array.isArray(obj.abilities) && obj.abilities.length>0){
      return obj.abilities.find(a=>a.primary) || obj.abilities[0] || {};
    }
  }catch(e){}
  // fallback to legacy top-level fields if present
  return {
    ability: obj.ability,
    actionType: obj.actionType,
    hitChance: obj.hitChance,
    critChance: obj.critChance,
    type: obj.type
  };
}

// RNG helpers: unified roll functions that prefer a seeded RNG on state
function _rngRoll(state){
  try{
    if(state && state.rng && typeof state.rng.rand === 'function') return state.rng.rand();
  }catch(e){}
  return Math.random();
}

function checkHit(state, chance){
  const c = (typeof chance === 'number') ? chance : 1.0;
  return _rngRoll(state) < c;
}

function checkCrit(state, chance){
  const c = (typeof chance === 'number') ? chance : 0.0;
  return _rngRoll(state) < c;
}

// Healer helper: heals a single target or the whole party depending on
// the card's ability text or an explicit targetIndex of 'all'. Returns
// a result object similar to the previous playHeroAction heal return.
function resolveHeal(state, slotIndex, amount, targetIndex=null){
  const hero = state.playfield[slotIndex];
  if(!hero) return { success:false, reason:'no hero' };
  const primary = getPrimaryAbility(hero.base);
  const abilityText = (primary && primary.ability) ? String(primary.ability).toLowerCase() : '';
  const isParty = (targetIndex === 'all') || /all|party|everyone|entire/i.test(abilityText) || (primary && primary.actionTarget === 'party') || (hero.base && hero.base.actionTarget === 'party');
  const healAmount = Number(amount) || 1;
  if(isParty){
    const healedSlots = [];
    state.playfield.forEach((h,i)=>{ if(h){ const before = h.hp; h.hp = Math.min(h.base.hp, h.hp + healAmount); const healed = h.hp - before; if(healed>0) healedSlots.push({ slot:i, healed, hp: h.hp }); } });
    state.ap -= 1;
    return { success:true, type:'heal', healed: healAmount, targets: healedSlots };
  }
  const targetSlot = (typeof targetIndex === 'number' && state.playfield[targetIndex]) ? state.playfield[targetIndex] : hero;
  const before = targetSlot.hp;
  targetSlot.hp = Math.min(targetSlot.base.hp, targetSlot.hp + healAmount);
  state.ap -= 1;
  const healed = targetSlot.hp - before;
  const slot = state.playfield.findIndex(h=>h===targetSlot);
  return { success:true, type:'heal', healed, slot, hp: targetSlot.hp };
}

// Centralized single-target attack resolution. Picks a target using
// `_selectSingleTargetIndex`, applies temp HP / defending logic, mutates
// state, and returns an array of event objects suitable for the UI.
function resolveSingleTargetAttack(state, dmg, attackIndex, attackName){
  const events = [];
  const idx = _selectSingleTargetIndex(state, state.rng);
  if(idx !== -1){
    const h = state.playfield[idx];
    if(h){
      // If this hero is protected (e.g., Willis), they take no damage
      if(h.protected && h.protected.turns > 0){
        const heroName = h.base && h.base.name ? h.base.name : null;
        const ev = { type:'hit', slot: idx, dmg: 0, tempTaken: 0, hpTaken: 0, remainingHp: h.hp, died:false, heroName };
        ev.attackType = 'single';
        if(typeof attackIndex === 'number') ev.attack = attackIndex+1;
        if(attackName) ev.attackName = attackName;
        ev.protected = true;
        events.push(ev);
        return events;
      }

      // Defending (Dodge) is handled at enemy attack resolution: single-target
      // defending now grants a 50% chance for the attack to miss. Here we
      // apply the damage passed in (defending does NOT halve single-target
      // damage any longer).
      let remaining = dmg;
      let tempTaken = 0;
      if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
      let hpTaken = 0;
      if(remaining>0){ h.hp -= remaining; hpTaken = remaining; }
      const died = h.hp <= 0;
      const heroName = h.base && h.base.name ? h.base.name : null;
      if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[idx] = null; }
      const ev = { type:'hit', slot: idx, dmg: dmg, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName };
      // mark event with attack type for UI/audio handling
      ev.attackType = 'single';
      if(typeof attackIndex === 'number') ev.attack = attackIndex+1;
      if(attackName) ev.attackName = attackName;
      events.push(ev);
    }
  }
  return events;
}

// Multi attack: perform two single-target attacks using the provided damage value.
// Each resulting event is marked with attackType='multi' so UI/audio can handle it.
function resolveMultiAttack(state, dmg, attackIndex, attackName){
  const events = [];
  try{
    const first = resolveSingleTargetAttack(state, dmg, attackIndex, attackName);
    first.forEach(ev=>{ ev.attackType = 'multi'; events.push(ev); });
    const second = resolveSingleTargetAttack(state, dmg, attackIndex, attackName);
    second.forEach(ev=>{ ev.attackType = 'multi'; events.push(ev); });
  }catch(e){ /* defensive: ignore errors and return what we have */ }
  return events;
}

// Centralized AOE attack resolution. Applies the AOE damage rules used
// throughout the file (defending halves damage for defending heroes),
// mutates state, and returns an array of events.
function resolveAoEAttack(state, baseDmg, attackIndex, attackName){
  const events = [];
  for(let i=0;i<state.playfield.length;i++){
    // If formation 3 is active, the backline slot (index 2) is specially
    // positioned and should be immune to AoE targeting by design — skip it.
    try{ if(Number(state.formation) === 3 && i === 2) continue; }catch(e){}
    const h = state.playfield[i];
    if(h){
      // If this hero is protected (e.g., Willis), they take no damage from AOE
      if(h.protected && h.protected.turns > 0){
        const heroName = h.base && h.base.name ? h.base.name : null;
        const ev = { type:'hit', slot: i, dmg: 0, tempTaken: 0, hpTaken: 0, remainingHp: h.hp, died:false, heroName };
        ev.attackType = 'aoe';
        if(typeof attackIndex === 'number') ev.attack = attackIndex+1;
        if(attackName) ev.attackName = attackName;
        ev.protected = true;
        events.push(ev);
        continue;
      }
      // AOE uses the full base damage; defending heroes still take half.
      let remaining = baseDmg;
      if(h.defending) remaining = Math.ceil(remaining/2);
      let tempTaken = 0;
      if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
      let hpTaken = 0;
      if(remaining>0){ h.hp -= remaining; hpTaken = remaining; }
      const died = h.hp <= 0;
      const heroName = h.base && h.base.name ? h.base.name : null;
      if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[i] = null; }
      const ev = { type:'hit', slot: i, dmg: baseDmg, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName };
      // mark event with attack type for UI/audio handling
      ev.attackType = 'aoe';
      if(typeof attackIndex === 'number') ev.attack = attackIndex+1;
      if(attackName) ev.attackName = attackName;
      events.push(ev);
    }
  }
  return events;
}

// Unified placeHero: either place into specified slot or into first empty slot.
// If called as placeHero(state, slotIndex, card) it will attempt that slot.
// If called as placeHero(state, card) it will place into the first empty slot (prefers 0,1 then 2).
// Placing into an empty slot does NOT cost AP. The placed card is removed from `state.deck.hand` if present.
export function placeHero(state, slotIndex, card){
  // Require explicit slotIndex; do not auto-place. Caller/UI should prompt for slot.
  if(card == null) return { success:false, reason:'no card' };
  if(typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex >= state.playfield.length) return { success:false, reason:'invalid slot' };
  if(state.playfield[slotIndex] !== null) return { success:false, reason:'slot occupied' };
  const hero = { cardId: card.id, hp: card.hp, base: card, tempHp: 0, statusIcons: [] };
  try{ if(typeof state._nextHeroInstanceId === 'undefined') state._nextHeroInstanceId = 1; hero._instanceId = 'h'+String(state._nextHeroInstanceId++); }catch(e){}
  state.playfield[slotIndex] = hero;
  // remove one copy from hand if present
  try{
    if(state.deck && Array.isArray(state.deck.hand)){
      const idx = state.deck.hand.findIndex(c=> c && c.id === card.id);
      if(idx !== -1) state.deck.hand.splice(idx,1);
    }
  }catch(e){ /* ignore hand removal failures */ }
  return { success:true, slot: slotIndex };
}

export function playHeroAttack(state, slotIndex, abilityIndex=null){
  if(state.ap <= 0) return { success:false, reason:'no AP' };
  const hero = state.playfield[slotIndex];
  if(!hero) return { success:false, reason:'no hero' };
  if(hero.stunnedTurns && hero.stunnedTurns>0) return { success:false, reason:'stunned' };
  // prefer an explicitly-selected ability when provided
  let primary = null;
  try{
    if(typeof abilityIndex === 'number' && hero && hero.base && Array.isArray(hero.base.abilities) && hero.base.abilities[abilityIndex]){
      primary = hero.base.abilities[abilityIndex];
    } else {
      primary = getPrimaryAbility(hero.base);
    }
  }catch(e){ primary = getPrimaryAbility(hero.base); }
  const baseDmg = parseDamageFromAbility(primary);
  const mult = state.nextAttackMultiplier || 1;
  // read optional hit/crit chances from the hero card metadata
  let hitChance = (primary && typeof primary.hitChance === 'number') ? primary.hitChance : 1.0;
  // apply any per-hero temporary hit chance bonuses (from Assist)
  try{ if(hero && typeof hero.hitBonus === 'number' && hero.hitBonus > 0){ hitChance = Math.min(1.0, hitChance + hero.hitBonus); } }catch(e){}
  const critChance = (primary && typeof primary.critChance === 'number') ? primary.critChance : 0.0;
  // consume AP for the attack attempt
  state.ap -= 1;
  // roll to hit
  // if hero is blinded, their attacks have a 50% miss penalty
  try{ if(hero && hero.blindedTurns && hero.blindedTurns>0){ hitChance = hitChance * 0.5; } }catch(e){}
  if(!checkHit(state, hitChance)){
    // attack missed — do not modify enemy HP
    if(mult !== 1) state.nextAttackMultiplier = 1;
    return { success:true, type: 'attack', dmg: 0, enemyHp: state.enemy.hp, missed: true };
  }
  // hit: roll for crit
  const isCrit = checkCrit(state, critChance);
  let dmg = Math.floor(baseDmg * mult * (isCrit ? 2 : 1));
  // physical damage penalty from enfeeble: halve final damage (rounded down)
  try{
    if(hero && hero.enfeebledTurns && hero.enfeebledTurns>0){
      dmg = Math.floor(dmg/2);
    }
  }catch(e){}
  state.enemy.hp = (state.enemy.hp || 0) - dmg;
  if(mult !== 1) state.nextAttackMultiplier = 1;
  return { success:true, type: 'attack', dmg, enemyHp: state.enemy.hp, crit: isCrit, baseDmg };
}

export function playHeroAction(state, slotIndex, targetIndex=null, abilityIndex=null){
  // generic action: attack or heal based on card ability text
  if(state.ap <= 0) return { success:false, reason:'no AP' };
  const hero = state.playfield[slotIndex];
  if(!hero) return { success:false, reason:'no hero' };
  if(hero.stunnedTurns && hero.stunnedTurns>0) return { success:false, reason:'stunned' };
  // prefer an explicitly-selected ability when provided
  let primary = null;
  try{
    if(typeof abilityIndex === 'number' && hero && hero.base && Array.isArray(hero.base.abilities) && hero.base.abilities[abilityIndex]){
      primary = hero.base.abilities[abilityIndex];
    } else {
      primary = getPrimaryAbility(hero.base);
    }
  }catch(e){ primary = getPrimaryAbility(hero.base); }
  const ability = (primary && primary.ability) ? String(primary.ability).toLowerCase() : '';
  const amount = parseDamageFromAbility(primary);
  // normalize id for legendaries that may not have `base`
  const hid = (hero.base && hero.base.id) ? hero.base.id : hero.cardId;
  // Determine explicit action type: prefer `actionType` then parse ability text.
  // Normalize to one of: 'dps', 'healer', 'support'. Default -> 'dps'.
  let actionType = (primary && primary.actionType) ? String(primary.actionType).toLowerCase() : null;
  if(!actionType){
    if(/heal|cure|restore|regen|heals?/i.test(ability)) actionType = 'healer';
    else actionType = 'dps';
  }
  // If this is a legendary placed card without `base`, some supports rely on card id.
  // Force support action for known support legendaries (e.g., bjurganmyr).
  const supportLegendaries = ['bjurganmyr','miley'];
  if(hid && supportLegendaries.indexOf(hid) !== -1){
    actionType = 'support';
  }
  // DPS: delegate to the existing attack function which handles AP and multiplier
  if(actionType === 'dps' || actionType === 'attack'){
    return playHeroAttack(state, slotIndex, abilityIndex);
  }
  // Healer: use the centralized resolveHeal helper (handles party or single-target heals)
  if(actionType === 'healer' || actionType === 'heal'){
    return resolveHeal(state, slotIndex, amount, targetIndex);
  }
  // Support: explicit id-based handling for support heroes (add more branches as needed)
  if(actionType === 'support'){
    // Normalize id and name for cases where the hero is a legendary (may lack `base`)
    const hid = (hero.base && hero.base.id) ? hero.base.id : hero.cardId;
    const hname = (hero.base && hero.base.name) ? hero.base.name : hid;
    // enforce once-per-round per support-id
    const sid = hid ? String(hid) : null;
    state.supportUsed = state.supportUsed || {};
    if(sid && state.supportUsed[sid]){
      return { success:false, reason:'used_this_round' };
    }

    // Shalendra: refresh Volo's summon availability for this encounter
    if (hid === 'shalendra') {
      if (!state.summonUsed) state.summonUsed = {};
      state.summonUsed['volo'] = false;
      if (!state.summonCooldowns) state.summonCooldowns = {};
      state.summonCooldowns['volo'] = 0;
      state.ap -= 1;
      state.supportUsed['shalendra'] = true;
      return { success:true, type:'support', slot: slotIndex, id:'shalendra', refreshed: 'volo' };
    }

    // Piter: special help action (marks this hero as helped for enemy single-target selection)
    if (hid === 'piter'){
      hero.helped = true;
      hero.helpSource = 'piter';
      // record status icon (order preserved)
      try{ hero.statusIcons = hero.statusIcons || []; hero.statusIcons.push({ id:'help', source:'piter', ts: Date.now() }); }catch(e){}
      state.ap -= 1;
      state.supportUsed['piter'] = true;
      return { success:true, type:'support', slot: slotIndex, id:'piter' };
    }

    // Lumalia: schedule a delayed damage effect that triggers after the enemy turn
    if (hid === 'lumalia'){
      state.pendingEffects = state.pendingEffects || [];
      state.pendingEffects.push({ type: 'delayedDamage', id: 'lumalia', slot: slotIndex, dmg: 6, trigger: 'afterEnemy', sourceName: hname });
      // add status icon on the slot so UI can show pending effect
      try{ const h = state.playfield[slotIndex]; if(h){ h.statusIcons = h.statusIcons || []; h.statusIcons.push({ id:'lumalia', source:'lumalia', ts: Date.now(), dmg:6 }); } }catch(e){}
      state.ap -= 1;
      state.supportUsed['lumalia'] = true;
      return { success:true, type:'support', slot: slotIndex, id:'lumalia', scheduled: true };
    }

    // Scout: supports include Rally (grant AP) and Assist (buff ally hit chance)
    if (hid === 'scout'){
      state.supportUsed = state.supportUsed || {};
      state.abilityCooldowns = state.abilityCooldowns || {};
      // Determine which ability was chosen (by index) or use primary
      let chosenAbility = null;
      try{
        if(typeof abilityIndex === 'number' && hero && hero.base && Array.isArray(hero.base.abilities) && hero.base.abilities[abilityIndex]){
          chosenAbility = hero.base.abilities[abilityIndex];
        } else {
          chosenAbility = getPrimaryAbility(hero.base);
        }
      }catch(e){ chosenAbility = getPrimaryAbility(hero.base); }
      const aname = (chosenAbility && chosenAbility.name) ? String(chosenAbility.name).toLowerCase() : ((chosenAbility && chosenAbility.ability) ? String(chosenAbility.ability).toLowerCase() : '');
      // Build a per-slot+ability key so cooldowns are per-ability, per-instance
      let aiKey = 'primary';
      try{
        if(typeof abilityIndex === 'number') aiKey = String(abilityIndex);
        else if(hero && hero.base && Array.isArray(hero.base.abilities)){
          const idx = hero.base.abilities.indexOf(chosenAbility);
          if(idx !== -1) aiKey = String(idx);
        }
      }catch(e){}
      // Use cardId so cooldowns persist by hero identity across replacements
      const inst = (hero && hero.cardId) ? hero.cardId : String(slotIndex);
      const abilityKey = String(inst) + ':ability' + String(aiKey);
      // Rally: grant +1 AP, has a 3-turn cooldown (per-ability)
      if(/rally/.test(aname)){
        // check cooldown for this specific ability instance
        if(state.abilityCooldowns[abilityKey] && state.abilityCooldowns[abilityKey] > 0){ return { success:false, reason:'cooldown' }; }
        state.ap = (state.ap || 0) + 1;
        state.supportUsed['scout'] = true;
        // read cooldown from ability data if present, otherwise default to 3
        const cdVal = (chosenAbility && typeof chosenAbility.cooldown === 'number') ? Number(chosenAbility.cooldown) : 3;
        state.abilityCooldowns[abilityKey] = cdVal;
        return { success:true, type:'support', slot: slotIndex, id:'scout', apGranted: 1, cooldown:cdVal, abilityKey };
      }
      // Assist: buff a target's hit chance by +0.2 for the remainder of the turn
      if(/assist/.test(aname)){
        if(typeof targetIndex !== 'number' || !state.playfield[targetIndex]){
          return { success:false, reason:'target_required' };
        }
        const tgt = state.playfield[targetIndex];
        // apply hit chance bonus (stacking if already present)
          tgt.hitBonus = (tgt.hitBonus || 0) + 0.20;
          // record assist icon on the target (preserve order)
          try{ tgt.statusIcons = tgt.statusIcons || []; tgt.statusIcons.push({ id:'assist', source:'scout', ts: Date.now(), amount: 0.20 }); }catch(e){}
          state.ap -= 1;
          state.supportUsed['scout'] = true;
        // set cooldown for this assist ability if defined on ability data
        const cdVal = (chosenAbility && typeof chosenAbility.cooldown === 'number') ? Number(chosenAbility.cooldown) : 0;
        if(cdVal > 0){ state.abilityCooldowns[abilityKey] = cdVal; }
        return { success:true, type:'support', slot: slotIndex, id:'scout', target: targetIndex, hitBonus: 0.20, abilityKey };
      }
      // fallback: treat as Rally if unknown
      if(!aname){
        if(state.abilityCooldowns[abilityKey] && state.abilityCooldowns[abilityKey] > 0){ return { success:false, reason:'cooldown' }; }
        state.ap = (state.ap || 0) + 1;
        state.supportUsed['scout'] = true;
        state.abilityCooldowns[abilityKey] = 3;
        return { success:true, type:'support', slot: slotIndex, id:'scout', apGranted: 1, cooldown:3, abilityKey };
      }
    }

    // Willis: protect a target from all damage for 1 turn
    if (hid === 'willis'){
      if(typeof targetIndex !== 'number' || !state.playfield[targetIndex]){
        return { success:false, reason:'target_required' };
      }
      const tgt = state.playfield[targetIndex];
      tgt.protected = { turns: 1, source: 'willis' };
      // add protection icon
      try{ tgt.statusIcons = tgt.statusIcons || []; tgt.statusIcons.push({ id:'protected', source:'willis', ts: Date.now(), turns:1 }); }catch(e){}
      state.ap -= 1;
      state.supportUsed['willis'] = true;
      return { success:true, type:'support', slot: slotIndex, id:'willis', target: targetIndex };
    }

    // Brer: deal 5 damage to the enemy now, and cause the enemy's next attack to deal half damage
    if (hid === 'brer'){
      const dmg = 5;
      state.enemy.hp = Math.max(0, (state.enemy.hp || 0) - dmg);
      // mark enemy so its next attack damage is halved
      state.enemy.nextAttackHalved = true;
      state.ap -= 1;
      state.supportUsed['brer'] = true;
      return { success:true, type:'support', slot: slotIndex, id:'brer', dmg, enemyHp: state.enemy.hp, nextEnemyAttackHalved: true };
    }

    // Bjurganmyr: immediate 8 damage, then 8 damage after the enemy act for the next 2 turns (stackable)
    if (hid === 'bjurganmyr'){
      const dmg = 8;
      state.enemy.hp = Math.max(0, (state.enemy.hp || 0) - dmg);
      state.pendingEffects = state.pendingEffects || [];
      // schedule two future triggers (afterEnemy). times=2 means it will trigger after the next 2 enemy turns
      state.pendingEffects.push({ type: 'delayedDamage', id: 'bjurganmyr', slot: slotIndex, dmg: dmg, trigger: 'afterEnemy', times: 2, sourceName: hname });
      state.ap -= 1;
      state.supportUsed['bjurganmyr'] = true;
      return { success:true, type:'support', slot: slotIndex, id:'bjurganmyr', dmg, enemyHp: state.enemy.hp, scheduled: true };
    }

    // Miley: immediate 8 damage, then 8 damage after the enemy act for the next 2 turns (stackable)
    if (hid === 'miley'){
      const dmg = 8;
      state.enemy.hp = Math.max(0, (state.enemy.hp || 0) - dmg);
      state.pendingEffects = state.pendingEffects || [];
      state.pendingEffects.push({ type: 'delayedDamage', id: 'miley', slot: slotIndex, dmg: dmg, trigger: 'afterEnemy', times: 2, sourceName: hname });
      state.ap -= 1;
      state.supportUsed['miley'] = true;
      return { success:true, type:'support', slot: slotIndex, id:'miley', dmg, enemyHp: state.enemy.hp, scheduled: true };
    }

    // Kiefer: 1 in 4 chance to stun the enemy for the rest of the encounter
    if (hid === 'kiefer'){
      state.ap -= 1;
      state.supportUsed['kiefer'] = true;
      // Use deterministic RNG if available on state, else fallback to Math.random
      let roll = (state.rng && typeof state.rng.int === 'function') ? (state.rng.int(4) + 1) : (Math.floor(Math.random()*4) + 1);
      if(roll === 1){
          state.enemy.stunnedTurns = 3;
          return { success:true, type:'support', slot: slotIndex, id:'kiefer', stunned: true, roll };
        }
      return { success:true, type:'support', slot: slotIndex, id:'kiefer', stunned: false, roll };
    }

    // Default support: no implicit behavior. Unknown support actions do nothing.
    return { success:false, reason:'no support action' };
  }

  // Unknown/unsupported action types do nothing
  return { success:false, reason:'unsupported actionType' };
}

export function defendHero(state, slotIndex){
  if(state.ap <= 0) return { success:false, reason:'no AP' };
  const hero = state.playfield[slotIndex];
  if(!hero) return { success:false, reason:'no hero' };
  if(hero.stunnedTurns && hero.stunnedTurns>0) return { success:false, reason:'stunned' };
  // mark hero as defending for the upcoming enemy action
  hero.defending = true;
  try{ hero.statusIcons = hero.statusIcons || []; hero.statusIcons.push({ id:'defend', source:'player', ts: Date.now() }); }catch(e){}
  state.ap -= 1;
  return { success:true };
}

export function replaceHero(state, slotIndex, newCard){
  const old = state.playfield[slotIndex];
  // If the slot is empty, placing the hero should be free (no AP cost).
  if(!old){
    state.playfield[slotIndex] = { cardId: newCard.id, hp: newCard.hp, base: newCard };
    return { success:true, slot: slotIndex };
  }
  // Replacement of an occupied slot costs AP.
  if(state.ap <= 0) return { success:false, reason:'no AP' };
  if(old){
    // Return the replaced character card back into the player's hand so it can be reused
    // during the remainder of the encounter (killed heroes remain removed).
    try{
      if(state.deck && Array.isArray(state.deck.hand)){
        // clone the base card but preserve current HP so returned card keeps damage taken
        const returned = Object.assign({}, old.base, { hp: old.hp });
        state.deck.hand.push(returned);
      }
    }catch(e){ /* ignore */ }
  }
  const repl = { cardId: newCard.id, hp: newCard.hp, base: newCard, statusIcons: [] };
  try{ if(typeof state._nextHeroInstanceId === 'undefined') state._nextHeroInstanceId = 1; repl._instanceId = 'h'+String(state._nextHeroInstanceId++); }catch(e){}
  state.playfield[slotIndex] = repl;
  state.ap -= 1;
  return { success:true };
}

export function endPlayerTurn(state){
  // end of player turn: enemy will act next. drawing is performed after enemy act
  // so the player receives a card at the start of their next turn.
}

export function enemyAct(state){
  state.turn++;
  // Decrement hero stun counters at the start of the enemy turn (stuns prevent one player turn)
  try{
    (state.playfield||[]).forEach(h=>{
      if(h && typeof h.stunnedTurns === 'number' && h.stunnedTurns>0){
        h.stunnedTurns = Math.max(0, (h.stunnedTurns||0) - 1);
      }
      if(h && typeof h.enfeebledTurns === 'number' && h.enfeebledTurns>0){
        h.enfeebledTurns = Math.max(0, (h.enfeebledTurns||0) - 1);
      }
    });
  }catch(e){}
  try{
    (state.playfield||[]).forEach(h=>{
      if(h && typeof h.blindedTurns === 'number' && h.blindedTurns>0){
        h.blindedTurns = Math.max(0, (h.blindedTurns||0) - 1);
      }
    });
  }catch(e){}
  // check stunned
  if(state.enemy.stunnedTurns && state.enemy.stunnedTurns>0){
    state.enemy.stunnedTurns--;
    // skip action
    state.ap = state.apPerTurn;
    // decrement summon cooldowns
    Object.keys(state.summonCooldowns).forEach(k=>{
      if(state.summonCooldowns[k] > 0) state.summonCooldowns[k]--;
    });
    // decrement ability cooldowns
    try{ Object.keys(state.abilityCooldowns||{}).forEach(k=>{ if(state.abilityCooldowns[k] > 0) state.abilityCooldowns[k]--; }); }catch(e){}
    // clear defending/helped markers so heroes recover from defend/help states
    state.playfield.forEach(h=>{ if(h && h.defending) h.defending = false; });
    state.playfield.forEach(h=>{ if(h && h.helped) h.helped = false; });
    // clear any temporary hit chance bonuses applied for the player's turn
    state.playfield.forEach(h=>{ if(h && h.hitBonus) { try{ h.hitBonus = 0; }catch(e){} } });
    // Process any pendingEffects that should trigger after the enemy acted
    // and collect UI events so callers see the damage produced while stunned.
    const stunnedEvents = [];
    if(state.pendingEffects && Array.isArray(state.pendingEffects) && state.pendingEffects.length>0){
      const remaining = [];
      state.pendingEffects.forEach(eff=>{
        if(eff && eff.trigger === 'afterEnemy'){
          if(eff.type === 'delayedDamage'){
            const dmg = Number(eff.dmg) || 0;
            state.enemy.hp = Math.max(0, state.enemy.hp - dmg);
            stunnedEvents.push({ type: 'enemyDamage', id: eff.id, slot: eff.slot, dmg: dmg, enemyHp: state.enemy.hp, sourceName: eff.sourceName });
          }
          if(typeof eff.times === 'number' && eff.times > 1){
            const copy = Object.assign({}, eff, { times: eff.times - 1 });
            remaining.push(copy);
          }
        } else {
          remaining.push(eff);
        }
      });
      state.pendingEffects = remaining;
    }
    // Decrement protection durations (e.g., Willis shield)
    state.playfield.forEach(h=>{
      if(h && h.protected){
        try{ h.protected.turns = (Number(h.protected.turns) || 0) - 1; }catch(e){}
        if(!h.protected || h.protected.turns <= 0){ try{ delete h.protected; }catch(e){} }
      }
    });
    // synchronize statusIcons with cleared properties (remove icons whose underlying state no longer present)
    try{
      state.playfield.forEach(h=>{
        if(!h || !h.statusIcons) return;
        h.statusIcons = (h.statusIcons || []).filter(si=>{
          if(!si || !si.id) return false;
          if(si.id === 'defend') return Boolean(h.defending);
          if(si.id === 'help') return Boolean(h.helped);
          if(si.id === 'assist') return Boolean(h.hitBonus && h.hitBonus > 0);
          if(si.id === 'protected') return Boolean(h.protected);
          if(si.id === 'stunned') return Boolean(h.stunnedTurns && h.stunnedTurns > 0);
          if(si.id === 'enfeebled') return Boolean(h.enfeebledTurns && h.enfeebledTurns > 0);
          if(si.id === 'lumalia'){
            // keep lumalia icon only if a pendingEffect for this slot remains
            const hasPending = (state.pendingEffects||[]).some(pe=>pe && pe.id === 'lumalia' && pe.slot === (state.playfield.indexOf(h)));
            return hasPending;
          }
          // Unknown or custom icons: only keep if they explicitly mark themselves persistent
          return Boolean(si && si.persistent);
        });
      });
    }catch(e){}
    // Reset per-round support usage so supports are usable next round
    try{ state.supportUsed = {}; }catch(e){}
    // return the stunned event plus any damage events produced by pendingEffects
    const baseEvent = {type:'stunned', msg:'Enemy stunned and skipped its turn'};
    const allEvents = [baseEvent].concat(stunnedEvents);
    return { did:'enemyStunned', events: allEvents };
  }
  // simple AI: choose single-target vs AOE randomly
  const rng = state.rng;
  const isAOE = rng ? (rng.int(2)===0) : (Math.random() < 0.3);
  const dmg = state.enemy.attack || 1;
  const events = [];
  if(state.enemy && Array.isArray(state.enemy.attacks) && state.enemy.attacks.length>0){
    const picks = state.enemy.attacks;
    const atkIndex = rng ? rng.int(picks.length) : Math.floor(Math.random()*picks.length);
    const atk = picks[atkIndex] || {};
    const attackName = atk.name || ('Attack '+(atkIndex+1));
    const type = (atk.type || 'single').toLowerCase();
    let baseDmg = (typeof atk.dmg === 'number') ? atk.dmg : (state.enemy.attack || 1);
    // if a support (e.g., Brer) caused the enemy's next attack to be halved,
    // apply that here and consume the flag so it only affects one attack.
    if(state.enemy && state.enemy.nextAttackHalved){
      baseDmg = Math.ceil(baseDmg/2);
      try{ delete state.enemy.nextAttackHalved; }catch(e){}
    }
    // Use centralized handlers for both AOE and single-target attacks
    if(type === 'aoe'){
      // AoE always hits per design — no hit/crit checks
      events.push(...resolveAoEAttack(state, baseDmg, atkIndex, attackName));
    } else if(type === 'multi'){
      // Multi attacks: perform two independent single-target sub-attacks,
      // each with its own hit and crit roll (if provided on the attack metadata).
      const hitChance = (atk && typeof atk.hitChance === 'number') ? atk.hitChance : 1.0;
      const critChance = (atk && typeof atk.critChance === 'number') ? atk.critChance : 0.0;
      for(let k=0;k<2;k++){
        if(!checkHit(state, hitChance)){
          const idx = _selectSingleTargetIndex(state, state.rng);
          if(idx !== -1 && state.playfield[idx]){
            const h = state.playfield[idx];
            const ev = { type:'hit', slot: idx, dmg: 0, tempTaken: 0, hpTaken: 0, remainingHp: h.hp, died:false, heroName: h.base && h.base.name ? h.base.name : null };
            ev.attackType = 'multi';
            if(typeof atkIndex === 'number') ev.attack = atkIndex+1;
            if(attackName) ev.attackName = attackName;
            ev.missed = true;
            events.push(ev);
          }
        } else {
          const isCrit = checkCrit(state, critChance);
          const usedDmg = isCrit ? Math.floor(baseDmg * 2) : baseDmg;
          const evs = resolveSingleTargetAttack(state, usedDmg, atkIndex, attackName);
          evs.forEach(ev=>{ ev.attackType = 'multi'; ev.crit = isCrit; ev.baseDmg = baseDmg; events.push(ev); });
        }
      }
    } else {
      // Single-target attack: if the chosen target is defending (Dodge), the
      // attack has a flat 50% chance to miss. If not defending, use the
      // attack's hit chance as before. Crit rolls still apply on hits.
      const hitChance = (atk && typeof atk.hitChance === 'number') ? atk.hitChance : 1.0;
      const critChance = (atk && typeof atk.critChance === 'number') ? atk.critChance : 0.0;
      const idx = _selectSingleTargetIndex(state, state.rng);
      if(idx !== -1 && state.playfield[idx]){
        const h = state.playfield[idx];
        // If defending, apply 50% dodge chance
        if(h.defending){
          const dodgeMiss = _rngRoll(state) < 0.5;
          if(dodgeMiss){
            const ev = { type:'hit', slot: idx, dmg: 0, tempTaken: 0, hpTaken: 0, remainingHp: h.hp, died:false, heroName: h.base && h.base.name ? h.base.name : null };
            ev.attackType = 'single';
            if(typeof atkIndex === 'number') ev.attack = atkIndex+1;
            if(attackName) ev.attackName = attackName;
            ev.missed = true;
            events.push(ev);
          } else {
            const isCrit = checkCrit(state, critChance);
            const usedDmg = isCrit ? Math.floor(baseDmg * 2) : baseDmg;
            const evs = resolveSingleTargetAttack(state, usedDmg, atkIndex, attackName);
            evs.forEach(ev=>{ ev.crit = isCrit; ev.baseDmg = baseDmg; events.push(ev); });
          }
        } else {
          // Not defending: use normal hit/crit resolution
          if(!checkHit(state, hitChance)){
            const ev = { type:'hit', slot: idx, dmg: 0, tempTaken: 0, hpTaken: 0, remainingHp: h.hp, died:false, heroName: h.base && h.base.name ? h.base.name : null };
            ev.attackType = 'single';
            if(typeof atkIndex === 'number') ev.attack = atkIndex+1;
            if(attackName) ev.attackName = attackName;
            ev.missed = true;
            events.push(ev);
          } else {
            const isCrit = checkCrit(state, critChance);
            const usedDmg = isCrit ? Math.floor(baseDmg * 2) : baseDmg;
            const evs = resolveSingleTargetAttack(state, usedDmg, atkIndex, attackName);
            evs.forEach(ev=>{ ev.crit = isCrit; ev.baseDmg = baseDmg; events.push(ev); });
          }
        }
      }
    }
    // after performing the attack(s), fall through to common end-of-turn housekeeping
    // (events have been populated above)
    // If this attack has a data-driven effect (e.g., stun), apply it to hit targets
    try{
      if(atk && atk.effect){
        const eff = String(atk.effect).toLowerCase();
        const newEvents = [];
        (events||[]).forEach(ev=>{
          try{
            if(ev && ev.type === 'hit' && !ev.missed && ((ev.hpTaken||0) > 0 || (ev.tempTaken||0) > 0)){
              const slot = ev.slot;
              const h = state.playfield[slot];
              if(!h) return;
              if(eff === 'stun'){
                h.stunnedTurns = Math.max(1, (h.stunnedTurns||0));
                try{ h.statusIcons = h.statusIcons || []; h.statusIcons.push({ id:'stunned', source: state.enemy && (state.enemy.id||state.enemy.name) || 'enemy', ts: Date.now(), turns: 1 }); }catch(e){}
                newEvents.push({ type:'heroStunned', slot, turns: 1, heroName: h.base && h.base.name ? h.base.name : null });
              }
              if(eff === 'enfeeble'){
                h.enfeebledTurns = Math.max(1, (h.enfeebledTurns||0));
                try{ h.statusIcons = h.statusIcons || []; h.statusIcons.push({ id:'enfeebled', source: state.enemy && (state.enemy.id||state.enemy.name) || 'enemy', ts: Date.now(), turns: 1 }); }catch(e){}
                newEvents.push({ type:'heroEnfeebled', slot, turns: 1, heroName: h.base && h.base.name ? h.base.name : null });
              }
              if(eff === 'blind'){
                h.blindedTurns = Math.max(1, (h.blindedTurns||0));
                try{ h.statusIcons = h.statusIcons || []; h.statusIcons.push({ id:'blind', source: state.enemy && (state.enemy.id||state.enemy.name) || 'enemy', ts: Date.now(), turns: 1 }); }catch(e){}
                newEvents.push({ type:'heroBlinded', slot, turns: 1, heroName: h.base && h.base.name ? h.base.name : null });
              }
            }
          }catch(e){}
        });
        if(newEvents.length) events.push(...newEvents);
      }
    }catch(e){}
  }
  // No data-driven `attacks` defined: do not perform legacy fallback attacks.
  // Advance turn housekeeping and return empty events — enemy cannot act.
  state.ap = state.apPerTurn;
  Object.keys(state.summonCooldowns).forEach(k=>{ if(state.summonCooldowns[k] > 0) state.summonCooldowns[k]--; });
  try{ Object.keys(state.abilityCooldowns||{}).forEach(k=>{ if(state.abilityCooldowns[k] > 0) state.abilityCooldowns[k]--; }); }catch(e){}
  state.playfield.forEach(h=>{ if(h && h.defending) h.defending = false; });
  state.playfield.forEach(h=>{ if(h && h.helped) h.helped = false; });
  // clear any temporary hit chance bonuses applied for the player's turn
  state.playfield.forEach(h=>{ if(h && h.hitBonus) { try{ h.hitBonus = 0; }catch(e){} } });
  // Process any pendingEffects that should trigger after the enemy acted
  if(state.pendingEffects && Array.isArray(state.pendingEffects) && state.pendingEffects.length>0){
    const remaining = [];
    state.pendingEffects.forEach(eff=>{
      if(eff && eff.trigger === 'afterEnemy'){
        if(eff.type === 'delayedDamage'){
          const dmg = Number(eff.dmg) || 0;
          state.enemy.hp = Math.max(0, state.enemy.hp - dmg);
          events.push({ type: 'enemyDamage', id: eff.id, slot: eff.slot, dmg: dmg, enemyHp: state.enemy.hp, sourceName: eff.sourceName });
          // If this effect should repeat for additional enemy turns, decrement its counter and keep it
          if(typeof eff.times === 'number' && eff.times > 1){
            const copy = Object.assign({}, eff, { times: eff.times - 1 });
            remaining.push(copy);
          }
        }
        // single-use or exhausted repeating effects are not kept
      } else {
        remaining.push(eff);
      }
    });
    state.pendingEffects = remaining;
  }
  // Decrement protection durations (e.g., Willis shield) so they last one enemy turn
  state.playfield.forEach(h=>{
    if(h && h.protected){
      try{ h.protected.turns = (Number(h.protected.turns) || 0) - 1; }catch(e){}
      if(!h.protected || h.protected.turns <= 0){ try{ delete h.protected; }catch(e){} }
    }
  });
  // synchronize statusIcons with cleared properties (remove icons whose underlying state no longer present)
  try{
    state.playfield.forEach(h=>{
      if(!h || !h.statusIcons) return;
      h.statusIcons = (h.statusIcons || []).filter(si=>{
        if(!si || !si.id) return false;
        if(si.id === 'defend') return Boolean(h.defending);
        if(si.id === 'help') return Boolean(h.helped);
        if(si.id === 'assist') return Boolean(h.hitBonus && h.hitBonus > 0);
        if(si.id === 'protected') return Boolean(h.protected);
        if(si.id === 'stunned') return Boolean(h.stunnedTurns && h.stunnedTurns > 0);
        if(si.id === 'enfeebled') return Boolean(h.enfeebledTurns && h.enfeebledTurns > 0);
        if(si.id === 'blind' || si.id === 'blinded') return Boolean(h.blindedTurns && h.blindedTurns > 0);
        if(si.id === 'lumalia'){
          const hasPending = (state.pendingEffects||[]).some(pe=>pe && pe.id === 'lumalia' && pe.slot === (state.playfield.indexOf(h)));
          return hasPending;
        }
        return Boolean(si && si.persistent);
      });
    });
  }catch(e){}
  // Reset per-round support usage so supports (like Scout) are usable next round
  try{ state.supportUsed = {}; }catch(e){}
  // drawing removed — cards remain static in `deck.hand` for duration of encounter
  return {did:'enemyAct', events};
}


export function useSummon(state, summonDef, targetIndex=null){
  if(!summonDef || !summonDef.id) return { success:false, reason:'invalid' };
  const id = summonDef.id;
  // check once-per-encounter restriction (only blocks within this encounter)
  if(summonDef.restriction && summonDef.restriction.toLowerCase().includes('once per encounter')){
    if(state.summonUsed[id]) return { success:false, reason:'used' };
  }
  // check cooldown
  const cd = state.summonCooldowns[id] || 0;
  if(cd > 0) return { success:false, reason:'cooldown' };
  // Concrete effects by known summon ids
  if(id === 'garon'){
    // heal entire party 1 HP
    state.playfield.forEach(h=>{ if(h) h.hp = Math.min(h.base.hp, h.hp + 1); });
  } 
  else if(id === 'volo'){
    // double next attack
    state.nextAttackMultiplier = 2;
  } 
  else if(id === 'blackrazor'){
    // give 30 temp HP to a target (if provided) or lowest-HP hero
    const heroes = state.playfield;
    if(!heroes.some(h=>h)) return { success:false, reason:'no_target' };
    let target = null;
    if(targetIndex !== null && heroes[targetIndex]) target = heroes[targetIndex];
    else target = heroes.filter(h=>h).reduce((a,b)=> (a.hp < b.hp ? a : b));
    if(!target) return { success:false, reason:'no_target' };
    target.tempHp = (target.tempHp||0) + 30;
      try{ AudioManager.playSfx(['./assets/sfx/blackrazor.mp3'], { volume: 0.6 }); }catch(e){}
  } 
  else if(id === 'whelm'){
    // stun enemy for 2 turns (ensure at least 2)
    state.enemy.stunnedTurns = Math.max(2, state.enemy.stunnedTurns||0);
    try{ AudioManager.playSfx(['./assets/sfx/whelm.mp3'], { volume: 0.3 }); }catch(e){}
  } 
  else if(id === 'wave'){
    // reduce enemy HP by 50% of max
    const max = state.enemy.maxHp || state.enemy.hp;
    const reduce = Math.floor((max * 0.5));
    state.enemy.hp = Math.max(0, state.enemy.hp - reduce);
    try{ AudioManager.playSfx(['./assets/sfx/wave.mp3'], { volume: 3.0 }); }catch(e){}
  } 
  else {
    // fallback: try to parse numeric heal
    const m = (summonDef.ability||'').match(/(\d+)/);
    const v = m ? Number(m[1]) : null;
    if(v){ state.playfield.forEach(h=>{ if(h) h.hp = Math.min(h.base.hp, h.hp + v); }); }
  }
  // mark used or set cooldown
  if(summonDef.restriction && summonDef.restriction.toLowerCase().includes('once per encounter')){
    state.summonUsed[id] = true;
    state.summonCooldowns[id] = 9999;
  } else if(summonDef.restriction && summonDef.restriction.toLowerCase().includes('once per run')){
    // mark used for this encounter (persistent run-level tracking handled by caller)
    state.summonUsed[id] = true;
    state.summonCooldowns[id] = 9999;
  } else if(summonDef.cooldown){
    state.summonCooldowns[id] = summonDef.cooldown;
  }
  return { success:true };
}

export function isFinished(state){
  if(state.enemy.hp<=0) return { winner: 'player' };
  // lose if no heroes on field and no cards in hand/draw?
  const anyHeroes = state.playfield.some(s=>s!==null);
  if(!anyHeroes){
    // only consider the run lost if at least one enemy turn has occurred
    // (i.e., after the first round). This prevents immediate loss on initial empty field.
    if(state.turn && state.turn > 0) return { winner: 'enemy' };
    return { winner: null };
  }
  return { winner: null };
}

