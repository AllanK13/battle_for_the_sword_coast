import { createRNG } from './engine/rng.js';
import { buildDeck } from './engine/deck.js';
import { startEncounter, playHeroAttack, playHeroAction, enemyAct, isFinished, placeHero, replaceHero, useSummon, defendHero } from './engine/encounter.js';
import { createMeta, buyUpgrade, buyLegendaryItem, loadMeta, saveMeta } from './engine/arcade_meta.js';
import { AudioManager } from './engine/audio.js';
import { register, navigate } from './ui/router.js';
import { renderStart } from './ui/screens/arcade_start.js';
import { renderMenu } from './ui/screens/menu.js';
import { renderAdventureStart } from './ui/screens/adventure_start.js';
import { renderStats } from './ui/screens/arcade_stats.js';
import { renderHowTo } from './ui/screens/arcade_howto.js';
import { renderUpgrades } from './ui/screens/arcade_upgrades.js';
import { renderBattle } from './ui/screens/battle.js';
import { renderEnd } from './ui/screens/end.js';
import { renderEncounterEnd } from './ui/screens/encounter_end.js';

const data = {};
let meta = loadMeta();

// Debug flag: allow enabling via meta, localStorage key `vcg_debug`, or URL `?debug=1`.
(function applyDebugFlag(){
  try{
    const urlDebug = (typeof window !== 'undefined' && window.location && new URLSearchParams(window.location.search).get('debug') === '1');
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('vcg_debug') === '1');
    // If `meta.debugEnabled` is an explicit boolean (true/false), honor it.
    // Otherwise fall back to URL or stored local flag.
    if (typeof meta.debugEnabled === 'boolean') {
      meta.debugEnabled = meta.debugEnabled;
    } else {
      meta.debugEnabled = urlDebug || stored;
    }
    // helper to toggle and persist the flag from the console: `toggleDebug(true)` / `toggleDebug(false)`
    window.toggleDebug = function(on){
      try{
        if(on) localStorage.setItem('vcg_debug','1'); else localStorage.removeItem('vcg_debug');
        meta.debugEnabled = !!on;
        try{ saveMeta(meta); }catch(e){}
        if(typeof window !== 'undefined' && window.location) window.location.reload();
      }catch(e){ /* ignore */ }
    };
    window.isDebugEnabled = function(){ return Boolean(meta.debugEnabled); };
  }catch(e){ /* ignore */ }
})();

async function loadData(){
  async function fetchAny(candidates){
    for(const p of candidates){
      try{
        const resp = await fetch(p);
        if(!resp.ok) continue;
        const j = await resp.json();
        return j;
      }catch(e){ /* try next */ }
    }
    return null;
  }

  // Simple fetch candidates: prefer local repository `data/` folder (relative).
  const cards = await fetchAny([
    './data/cards.json', 'data/cards.json', '/data/cards.json'
  ]);
  const summons = await fetchAny([
    './data/summons.json', 'data/summons.json', '/data/summons.json'
  ]);
  const enemies = await fetchAny([
    './data/enemies.json', 'data/enemies.json', '/data/enemies.json'
  ]);
  const arcadePath = await fetchAny([
    './data/arcade_path.json', 'data/arcade_path.json', '/data/arcade_path.json'
  ]);
  const legendary = await fetchAny([
    './data/legendary.json', 'data/legendary.json', '/data/legendary.json'
  ]);
  const upgrades = await fetchAny([
    './data/upgrades.json', 'data/upgrades.json', '/data/upgrades.json'
  ]);

  data.cards = cards; data.summons = summons; data.enemies = enemies; data.upgrades = upgrades; data.legendary = legendary || [];
  data.arcadePath = arcadePath || null;
}

// Helper: create a deck, start an encounter and build the UI context object.
function createEncounterSession(enemyIndex, chosenIds, rng){
  // keep a local mutable copy of the chosen ids so we can rebuild the deck
  let chosen = Array.isArray(chosenIds) ? chosenIds.slice() : [];
  // allow legendary entries that are full hero cards (have `hp`) to be used as card definitions
  const legendaryCards = (data.legendary || []).filter(l => l && typeof l.hp === 'number');
  const cardDefs = (data.cards || []).concat(legendaryCards);
  let deck = buildDeck(cardDefs, chosen, rng);
  let currentEnemyIndex = (typeof enemyIndex === 'number') ? enemyIndex : 0;
  // determine the active arcade path (array of enemy ids). Fall back to raw enemies order when missing
  const path = (data.arcadePath && Array.isArray(data.arcadePath) && data.arcadePath.length>0) ? data.arcadePath : ((data.enemies||[]).map(e=> e && e.id).filter(Boolean));
  // resolve current enemy by id from the path, fall back to direct index into data.enemies
  const currentEnemyId = path[currentEnemyIndex];
  let enemy = (data.enemies||[]).find(e => e && e.id === currentEnemyId) || data.enemies[currentEnemyIndex];
  let encounter = startEncounter({...enemy}, deck, rng, { apPerTurn: meta.apPerTurn || 3 });
  // defensive: ensure per-encounter flags are fresh
  try{
    encounter.summonUsed = encounter.summonUsed || {};
    encounter.summonCooldowns = encounter.summonCooldowns || {};
    encounter.exhaustedThisEncounter = encounter.exhaustedThisEncounter || [];
  }catch(e){}

  const runSummary = { defeated: [], diedTo: null, ipEarned: 0 };

  const ctx = {
    data, meta,
    encounter,
    message: '',
    messageHistory: [],
    setMessage(msg, timeout=3000){
      const entry = { text: msg, ts: Date.now() };
      ctx.message = msg;
      ctx.messageHistory = ctx.messageHistory || [];
      ctx.messageHistory.unshift(entry);
      // keep history short
      if(ctx.messageHistory.length>50) ctx.messageHistory.length = 50;
      if(typeof ctx.onStateChange === 'function') ctx.onStateChange();
      if(timeout) setTimeout(()=>{ if(ctx.message===msg){ ctx.message=''; if(typeof ctx.onStateChange === 'function') ctx.onStateChange(); } }, timeout);
    },
    dismissMessage(){ ctx.message=''; if(typeof ctx.onStateChange === 'function') ctx.onStateChange(); },
    clearMessageHistory(){ ctx.messageHistory = []; if(typeof ctx.onStateChange === 'function') ctx.onStateChange(); },
    // Notify UI to re-render the battle screen when state changes.
    onStateChange(){ navigate('battle', ctx); },
    placeHero(card){return handlePlaceHero(encounter, ctx, card); },
    placeHeroAt(slot, card){
      const res = placeHero(encounter, slot, card);
      if(res.success){ if(ctx.setMessage) ctx.setMessage('Placed '+(card.name||card.id)+' in space '+(res.slot+1)); }
      else { if(ctx.setMessage) ctx.setMessage(res.reason||'Place failed'); }
      return res;
    },
    playHeroAttack(slot){
      const res = playHeroAttack(encounter, slot);
      if(!res.success){ if(ctx.setMessage) ctx.setMessage(res.reason||'Attack failed'); }
      else {
        // derive friendly hero and enemy names for messages
        const heroName = (encounter.playfield && encounter.playfield[slot] && encounter.playfield[slot].base && encounter.playfield[slot].base.name) ? encounter.playfield[slot].base.name : ('Hero ' + (slot+1));
        const enemyName = (encounter.enemy && (encounter.enemy.name || encounter.enemy.id)) ? (encounter.enemy.name || encounter.enemy.id) : 'Enemy';
        if(res.missed){
          if(ctx.setMessage) ctx.setMessage(heroName+' missed '+enemyName);
        } else if(res.crit){
          if(ctx.setMessage) ctx.setMessage(heroName+' critically hit '+enemyName+' for '+res.dmg+' damage. '+enemyName+' HP: '+res.enemyHp);
        } else {
          if(ctx.setMessage) ctx.setMessage(heroName+' dealt '+res.dmg+' damage. '+enemyName+' HP: '+res.enemyHp);
        }
        try{
          if(res.dmg && res.dmg > 0){
            const sfxCandidates = ['./assets/sfx/player_attack.mp3'];
            AudioManager.playSfx(sfxCandidates, { volume: 1.0 });
          }
        }catch(e){}
      }
      return res;
    },
    playHeroAction(slot, targetIndex, abilityIndex){
      return handlePlayHeroAction(encounter, ctx, slot, targetIndex, abilityIndex);
    },
    defendHero(slot){
      const res = defendHero(encounter, slot);
      if(!res.success){ if(ctx.setMessage) ctx.setMessage(res.reason||'Defend failed'); }
      else {
        const heroName = (encounter.playfield && encounter.playfield[slot] && encounter.playfield[slot].base && encounter.playfield[slot].base.name) ? encounter.playfield[slot].base.name : ('Hero ' + (slot+1));
        if(ctx.setMessage) ctx.setMessage(heroName+' is dodging');
      }
      return res;
    },
    replaceHero(slot, card){
      const res = replaceHero(encounter, slot, card);
      if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'Replace failed'); }
      else { if(ctx.setMessage) ctx.setMessage('Replaced space '+(slot+1)+' with '+(card.name||card.id)); }
      return res;
    },
    useSummon(id, targetIndex=null){
      // look for the summon in regular summons first, then in legendary pool
      let s = (data.summons||[]).find(x=>x.id===id);
      if(!s) s = (data.legendary||[]).find(x=>x.id===id);
      // Enforce once-per-run restriction using persisted meta.summonUsage
      try{
        if(s && s.restriction && s.restriction.toLowerCase().includes('once per run')){
          meta.summonUsage = meta.summonUsage || {};
          if(meta.summonUsage[s.id] && meta.summonUsage[s.id] > 0){
            const msg = 'Summon \'' + (s.name||s.id) + '\' is only usable once per run';
            if(ctx.setMessage) ctx.setMessage(msg);
            return { success:false };
          }
        }
      }catch(e){ /* ignore meta read errors */ }
      const r = useSummon(encounter,s,targetIndex);
      if(!r.success){ if(ctx.setMessage) ctx.setMessage(r.reason||'Summon failed'); }
      else { if(ctx.setMessage) ctx.setMessage('Summon: '+(s.name||s.id)+' used'); }
      // track summon usage (use the passed `id` as a reliable key)
      try{
        if(r && r.success && id){
          meta.summonUsage = meta.summonUsage || {};
          meta.summonUsage[id] = (meta.summonUsage[id] || 0) + 1;
          // also record cumulative usage separately for Stats
          meta.totalSummonUsage = meta.totalSummonUsage || {};
          meta.totalSummonUsage[id] = (meta.totalSummonUsage[id] || 0) + 1;
          saveMeta(meta);
        }
      }catch(e){ /* ignore */ }
      return r;
    },
    runSummary,
    currentEnemyIndex,
    endTurn(){
      const res = enemyAct(encounter);
      // process events for messaging — include enemy name instead of generic 'Enemy'
      const enemyName = (encounter.enemy && (encounter.enemy.name || encounter.enemy.id)) ? (encounter.enemy.name || encounter.enemy.id) : 'Enemy';
      let messages = [];
      if(res && res.events && res.events.length) {
        messages = res.events.map(ev => {
          if(ev.type === 'stunned') return enemyName + ' stunned and skipped its turn';
          if(ev.type === 'enemyDamage') {
            const src = ev.sourceName || (ev.id ? ev.id : 'Ally');
            return (src + ' dealt ' + (ev.dmg||0) + ' damage to ' + enemyName + '. HP: ' + (ev.enemyHp||0));
          }
          if(ev.type === 'hit') {
              const name = ev.heroName || (encounter.playfield[ev.slot] && encounter.playfield[ev.slot].base && encounter.playfield[ev.slot].base.name) || ('space ' + (ev.slot+1));
              const totalDmg = (ev.tempTaken||0)+(ev.hpTaken||0);
            const attackPrefix = ev.attackName ? (enemyName + ' used ' + ev.attackName + ' and ') : (enemyName + ' ');
              if(ev.missed) return attackPrefix + 'missed ' + name;
              if(ev.died) return (ev.crit ? attackPrefix + 'critically hit ' : attackPrefix + 'hit ') + name + ' for ' + totalDmg + ' and killed it';
              if(totalDmg === 0) return attackPrefix + 'attacked ' + name + ' but dealt no damage';
              if(ev.crit) return attackPrefix + 'critically hit ' + name + ' for ' + totalDmg + ', remaining HP: ' + ev.remainingHp;
              return attackPrefix + 'hit ' + name + ' for ' + totalDmg + ', remaining HP: ' + ev.remainingHp;
          }
              if(ev.type === 'heroStunned'){
                const hn = ev.heroName || (encounter.playfield[ev.slot] && encounter.playfield[ev.slot].base && encounter.playfield[ev.slot].base.name) || ('space ' + (ev.slot+1));
                return hn + ' stunned for ' + (ev.turns||1) + ' turn' + ((ev.turns||1)>1 ? 's':'' ) + '.';
              }
              if(ev.type === 'heroEnfeebled'){
                const hn2 = ev.heroName || (encounter.playfield[ev.slot] && encounter.playfield[ev.slot].base && encounter.playfield[ev.slot].base.name) || ('space ' + (ev.slot+1));
                return hn2 + ' enfeebled — physical attacks deal half damage for ' + (ev.turns||1) + ' turn' + ((ev.turns||1)>1 ? 's' : '') + '.';
              }
              if(ev.type === 'heroBlinded'){
                const hn3 = ev.heroName || (encounter.playfield[ev.slot] && encounter.playfield[ev.slot].base && encounter.playfield[ev.slot].base.name) || ('space ' + (ev.slot+1));
                return hn3 + ' blinded — 50% miss chance for ' + (ev.turns||1) + ' turn' + ((ev.turns||1)>1 ? 's' : '') + '.';
              }
          return null;
        }).filter(Boolean);
      }
      // If no messages were generated, show a fallback using the enemy's name
      if (!messages.length) {
        if (res && res.did === 'enemyStunned') {
          messages = [enemyName + ' stunned and skipped its turn'];
        } else if (res && res.did === 'enemyAct') {
          messages = [enemyName + ' could not attack (no targets)'];
        } else {
          messages = [enemyName + ' turn passed'];
        }
      }
      // determine whether the encounter finished (player killed enemy) before playing SFX
      const finished = isFinished(encounter).winner;
      // play enemy SFX for attacks only if the enemy wasn't killed by this action
      if(finished !== 'player'){
        try{
          const hasAoE = res && Array.isArray(res.events) && res.events.some(ev => ev.attackType === 'aoe');
          const hasMulti = res && Array.isArray(res.events) && res.events.some(ev => ev.attackType === 'multi');
          const hasSingle = res && Array.isArray(res.events) && res.events.some(ev => ev.attackType === 'single');
          if(hasAoE){
            const sfxCandidates = ['./assets/sfx/enemy_aoe.mp3'];
            AudioManager.playSfx(sfxCandidates, { volume: 0.3 });
          } else if(hasMulti){
            const sfxCandidates = ['./assets/sfx/enemy_attack.mp3'];
            // play twice for multi attacks (slight stagger so they are audible separately)
            try{ AudioManager.playSfx(sfxCandidates, { volume: 0.2 }); }catch(e){}
            setTimeout(()=>{ try{ AudioManager.playSfx(sfxCandidates, { volume: 0.2 }); }catch(e){} }, 200);
          } else if(hasSingle){
            const sfxCandidates = ['./assets/sfx/enemy_attack.mp3'];
            AudioManager.playSfx(sfxCandidates, { volume: 0.2 });
          }
        }catch(e){}
      }
      // expose the enemy's last named attack for UI overlays (floating label)
      try{
        if(res && Array.isArray(res.events)){
          const atkEv = res.events.find(ev => ev && ev.attackName);
          if(atkEv && atkEv.attackName){
            ctx._lastEnemyAttack = { name: String(atkEv.attackName), ts: Date.now() };
            // clear after 1s and trigger a re-render
            setTimeout(()=>{ try{ if(ctx._lastEnemyAttack && ctx._lastEnemyAttack.name === atkEv.attackName){ delete ctx._lastEnemyAttack; if(typeof ctx.onStateChange === 'function') ctx.onStateChange(); } }catch(e){} }, 1000);
          }
        }
      }catch(e){}
      if(messages.length) ctx.setMessage(messages.join('\n'), 1000); // 1 second for enemy actions
      if(finished === 'player'){
        // Player defeated the enemy — show an encounter-end screen summarizing the kill and IP reward
        const reward = encounter.enemy.ip_reward || 1;
        // temporarily disable state updates while the encounter-end screen is shown
        const prevOnState = ctx.onStateChange;
        const prevSetMessage = ctx.setMessage;
        ctx.onStateChange = ()=>{};
        ctx.setMessage = ()=>{};

        const encounterEndCtx = {
          data,
          enemy: encounter.enemy,
          reward,
          runSummary,
          showIp: true,
          onContinue: ()=>{
            // restore handlers
            ctx.onStateChange = prevOnState;
            ctx.setMessage = prevSetMessage;
            // record defeated enemy and award IP
            const enemyKey = encounter.enemy.id || encounter.enemy.name || 'unknown';
            runSummary.defeated.push(enemyKey);
            runSummary.ipEarned = (runSummary.ipEarned||0) + reward;
            meta.ip += reward;
            meta.totalIpEarned = (meta.totalIpEarned||0) + reward;
            // update persistent stats
            try{
              meta.encountersBeaten = (meta.encountersBeaten || 0) + 1;
              // furthest reached enemy: use current index
              meta.furthestReachedEnemy = Math.max((meta.furthestReachedEnemy||0), currentEnemyIndex);
              // increment per-enemy defeat count
              meta.enemyDefeatCounts = meta.enemyDefeatCounts || {};
              meta.enemyDefeatCounts[enemyKey] = (meta.enemyDefeatCounts[enemyKey] || 0) + 1;
              saveMeta(meta);
            }catch(e){ /* ignore */ }
            // advance to next enemy according to the arcade path if present
            currentEnemyIndex += 1;
            if(currentEnemyIndex < path.length){
              const nextId = path[currentEnemyIndex];
              enemy = (data.enemies||[]).find(e => e && e.id === nextId) || data.enemies[currentEnemyIndex];
              // refresh characters/deck so all heroes are available for the next encounter
              // gather every card that may exist in the previous deck/encounter (draw/hand/discard/exhausted/played)
              try{
                // preserve duplicate copies: collect ids with multiplicity
                const allIdsList = [];
                // from current deck arrays (if present)
                if(deck && Array.isArray(deck.draw)) deck.draw.forEach(c=> c && c.id && allIdsList.push(c.id));
                if(deck && Array.isArray(deck.hand)) deck.hand.forEach(c=> c && c.id && allIdsList.push(c.id));
                if(deck && Array.isArray(deck.discard)) deck.discard.forEach(c=> c && c.id && allIdsList.push(c.id));
                if(deck && Array.isArray(deck.exhausted)) deck.exhausted.forEach(c=> c && c.id && allIdsList.push(c.id));
                // from encounter-level exhausted or playfield
                if(encounter && Array.isArray(encounter.exhaustedThisEncounter)) encounter.exhaustedThisEncounter.forEach(c=> c && c.id && allIdsList.push(c.id));
                if(encounter && Array.isArray(encounter.playfield)) encounter.playfield.forEach(h=>{ if(h && h.base && h.base.id) allIdsList.push(h.base.id); });
                // fallback to originally chosen set if nothing found
                const rebuildIds = (allIdsList.length>0) ? allIdsList : chosen.slice();
                // update chosen so subsequent rebuilds preserve this pool
                chosen = rebuildIds.slice();
                // rebuild deck using combined card defs (include legendary heroes)
                const legendaryCards = (data.legendary || []).filter(l => l && typeof l.hp === 'number');
                const cardDefs = (data.cards || []).concat(legendaryCards);
                deck = buildDeck(cardDefs, rebuildIds, RNG);
              }catch(e){ console.warn('Failed to rebuild deck for next encounter', e); }
              encounter = startEncounter({...enemy}, deck, RNG, { apPerTurn: meta.apPerTurn || 3 });
              ctx.encounter = encounter;
              ctx.currentEnemyIndex = currentEnemyIndex;
              // persist updated IP immediately
              try{ saveMeta(meta); }catch(e){ console.warn('saveMeta failed', e); }
              if(ctx.setMessage) ctx.setMessage('Next enemy: '+(enemy.name||enemy.id));
              ctx.onStateChange();
              return;
            } else {
              // no more enemies -> end run
              try{ meta.runs = (meta.runs||0) + 1; saveMeta(meta); }catch(e){}
              const endCtx = { data, runSummary, showIp: true, onRestart: ()=>{ try{ meta.summonUsage = {}; saveMeta(meta); }catch(e){}; navigate('arcade_start'); } };
              // prevent any pending timeouts or future onStateChange calls from re-rendering the battle
              ctx.onStateChange = ()=>{};
              ctx.setMessage = ()=>{};
              navigate('arcade_end', endCtx);
              return;
            }
          }
        };
        navigate('arcade_encounter_end', encounterEndCtx);
        return;
      } else if(finished === 'enemy'){
        // record death
        const enemyKey = encounter.enemy.id || encounter.enemy.name || 'unknown';
        runSummary.diedTo = enemyKey;
        // update run stats (failed run) and compute V interest if applicable
        let vInterest = 0;
        try{
          meta.runs = (meta.runs||0) + 1;
          meta.furthestReachedEnemy = Math.max((meta.furthestReachedEnemy||0), currentEnemyIndex);
          // increment per-enemy victory count
          meta.enemyVictoryCounts = meta.enemyVictoryCounts || {};
          meta.enemyVictoryCounts[enemyKey] = (meta.enemyVictoryCounts[enemyKey] || 0) + 1;
          // If player purchased invest_v, award 25% of run IP (rounded down)
          if(meta && Array.isArray(meta.purchasedUpgrades) && meta.purchasedUpgrades.includes('invest_v')){
            vInterest = Math.floor((runSummary.ipEarned||0) * 0.15);
            meta.ip += vInterest;
            meta.totalIpEarned = (meta.totalIpEarned||0) + vInterest;
          }
          saveMeta(meta);
        }catch(e){}
        // capture the last battle history message (if any) so the end screen
        // can show what dealt the killing blow
        const lastHistoryMessage = (ctx && Array.isArray(ctx.messageHistory) && ctx.messageHistory.length>0) ? ctx.messageHistory[0].text : null;
        const endCtx = { data, runSummary, vInterest, lastHistoryMessage, showIp: true, onRestart: ()=>{ try{ meta.summonUsage = {}; saveMeta(meta); }catch(e){}; navigate('arcade_start'); } };
        // prevent any pending timeouts or future onStateChange calls from re-rendering the battle
        ctx.onStateChange = ()=>{};
        ctx.setMessage = ()=>{};        
        navigate('arcade_end', endCtx);
        return;
      }
      // otherwise continue same encounter
      navigate('battle', ctx);
    }
  };

  return { ctx, deck, encounter, runSummary, currentEnemyIndex };
}

// Shared handler for hero actions (consolidates SFX + message logic)
function handlePlayHeroAction(encounter, ctx, slot, targetIndex, abilityIndex){
  const res = playHeroAction(encounter, slot, targetIndex, abilityIndex);
  if(!res || !res.success){ if(ctx.setMessage) ctx.setMessage((res && res.reason) ? res.reason : 'Action failed'); return res; }
  if(res.type === 'attack'){
    // include hero & enemy names in the attack message
    const heroName = (encounter.playfield && encounter.playfield[slot] && encounter.playfield[slot].base && encounter.playfield[slot].base.name) ? encounter.playfield[slot].base.name : ('Hero ' + (slot+1));
    const enemyName = (encounter.enemy && (encounter.enemy.name || encounter.enemy.id)) ? (encounter.enemy.name || encounter.enemy.id) : 'Enemy';
    if(res.missed){
      if(ctx.setMessage) ctx.setMessage(heroName+' missed '+enemyName);
    } else if(res.crit){
      if(ctx.setMessage) ctx.setMessage(heroName+' critically hit '+enemyName+' for '+res.dmg+' damage. '+enemyName+' HP: '+res.enemyHp);
    } else {
      if(ctx.setMessage) ctx.setMessage(heroName+' dealt '+res.dmg+' damage. '+enemyName+' HP: '+res.enemyHp);
    }
    try{
      if(res.dmg && res.dmg > 0){
        const sfxCandidates = ['./assets/sfx/player_attack.mp3','assets/sfx/player_attack.mp3','/assets/sfx/player_attack.mp3','./assets/music/player_attack.mp3','assets/music/player_attack.mp3','/assets/music/player_attack.mp3'];
        AudioManager.playSfx(sfxCandidates, { volume: 0.5 });
      }
    }catch(e){}
  } else if(res.type === 'heal'){
    // handle single-target heal (has `hp`) and party heal (has `targets` array)
    if(res.hp !== undefined){
      if(ctx.setMessage) ctx.setMessage('Hero healed '+res.healed+' HP (now '+res.hp+')');
    } else if(Array.isArray(res.targets) && res.targets.length>0){
      const parts = res.targets.map(t => {
        const name = (encounter.playfield[t.slot] && encounter.playfield[t.slot].base && encounter.playfield[t.slot].base.name) ? encounter.playfield[t.slot].base.name : ('space '+(t.slot+1));
        return (name + ': ' + (t.hp||0));
      });
      if(ctx.setMessage) ctx.setMessage('Healed '+res.healed+' HP to party — '+parts.join(', '));
    } else {
      if(ctx.setMessage) ctx.setMessage('Healed '+res.healed+' HP');
    }
  } else if(res.type === 'support'){
    if(ctx.setMessage) ctx.setMessage('Support ability used');
  }
  return res;
}

// Shared handler for placing a hero (used by multiple contexts)
function handlePlaceHero(encounter, ctx, card){
  // Always prompt UI for slot selection instead of auto-placing.
  // The UI should call `ctx.placeHeroAt(slot, card)` when the player selects a slot.
  return { success:false, reason:'prompt' };
}

function appStart(){
  // On first-ever run, grant starter ownership if none present
  try{
    if((meta.runs||0) === 0){
      if(!(Array.isArray(meta.ownedCards) && meta.ownedCards.length > 0)){
        meta.ownedCards = (data.cards||[]).filter(c=>c && c.starter).map(c=>c.id);
      }
      if(!(Array.isArray(meta.ownedSummons) && meta.ownedSummons.length > 0)){
        meta.ownedSummons = (data.summons||[]).filter(s=>s && s.starter).map(s=>s.id);
      }
      saveMeta(meta);
    }
  }catch(e){}
  register('arcade_start', (root)=> {
    // Switch to menu music when entering the start screen
    try{
      const musicCandidates = ['./assets/music/menu.mp3','assets/music/menu.mp3','/assets/music/menu.mp3'];
      AudioManager.init(musicCandidates[0], { autoplay:true, loop:true });
    }catch(e){ /* ignore */ }
    return renderStart(root, {
      data,
      meta,
      selectCard(id){ },
      onStartRun(opts){ startRun(opts); },
      onShowStats(){ navigate('arcade_stats'); },
      onShowHowTo(){ navigate('arcade_howto'); },
      onShowUpgrades(){ navigate('arcade_upgrades'); },
      onDebugGrant(){
        try{ meta.ip = (meta.ip||0) + 10000; saveMeta(meta); }catch(e){}
        navigate('arcade_start');
      },
      onDebugUnlock(){
        try{
          // grant all cards and summons
          meta.ownedCards = (data.cards||[]).filter(c=>c && c.id).map(c=>c.id);
          meta.ownedSummons = (data.summons||[]).filter(s=>s && s.id).map(s=>s.id);
          meta.legendaryUnlocked = true;
          // top up IP too
          meta.ip = (meta.ip||0) + 10000;
          saveMeta(meta);
        }catch(e){}
        navigate('arcade_start');
      }
      ,
      onDebugUnlockTown(){
        try{
          meta.totalIpEarned = Math.max(1, (meta.totalIpEarned||0));
          saveMeta(meta);
        }catch(e){}
        navigate('arcade_start');
      }
      ,
      onDebugStartEnemy(indexOrId){
        try{
          // resolve index if provided an id/name
          let idx = -1;
          if(typeof indexOrId === 'number') idx = Number(indexOrId);
          else if(typeof indexOrId === 'string') idx = (data.enemies||[]).findIndex(e=> e && (e.id===indexOrId || e.name===indexOrId));
          if(idx < 0 || !(data.enemies && data.enemies[idx])) { return; }
          // build a random chosen deck (sample up to 10 cards from available card pool)
          const pool = (data.cards||[]).filter(c=>c && c.id);
          const desired = Math.min(10, Math.max(pool.length, 3));
          const chosen = [];
          while(chosen.length < desired && pool.length > 0){
            const idxPick = (typeof RNG !== 'undefined' && RNG) ? RNG.int(pool.length) : Math.floor(Math.random()*pool.length);
            const id = pool[idxPick].id;
            if(!chosen.includes(id)) chosen.push(id);
          }
          // Ensure debug encounters always include these characters when available
          const debugMandatory = ['robohoam','bjurganmyr','tor'];
          debugMandatory.forEach(id => { if(!chosen.includes(id)) chosen.push(id); });
          // Trim to desired length but keep mandatory IDs
          if(chosen.length > desired){
            const keep = debugMandatory.filter(id=> chosen.includes(id));
            const rest = chosen.filter(id=> !keep.includes(id)).slice(0, Math.max(0, desired - keep.length));
            const finalChosen = keep.concat(rest);
            // replace contents
            chosen.length = 0; finalChosen.forEach(x=> chosen.push(x));
          }
          // build deck and start a single-encounter state
          const session = createEncounterSession(idx, chosen, RNG);
          navigate('battle', session.ctx);
        }catch(e){}
      }
    });
  });

  // Adventure Mode start screen
  register('adventure_start', (root)=> {
    try{
      const musicCandidates = ['./assets/music/menu.mp3','assets/music/menu.mp3','/assets/music/menu.mp3'];
      AudioManager.init(musicCandidates[0], { autoplay:true, loop:true });
    }catch(e){}
    return renderAdventureStart(root, {
      data,
      meta,
      onBack: ()=> navigate('menu'),
      onStartAdventure: (id)=>{
        // Default behavior: navigate back to menu; callers can override via ctx
        try{ if(typeof id === 'string') console.log('Start adventure:', id); }catch(e){}
        navigate('menu');
      }
    });
  });

  // Top-level menu screen with Arcade / Adventure / Campaign options
  register('menu', (root)=> renderMenu(root, { data, meta, onArcade: ()=> navigate('arcade_start'), onAdventure: ()=> navigate('adventure_start') }));

  register('arcade_stats', (root)=> renderStats(root, { data, meta, onBack: ()=> navigate('arcade_start') }));

  register('arcade_upgrades', (root)=> {
    // Switch to town music when entering upgrades screen (if available)
    try{
      const musicCandidates = ['./assets/music/town.mp3','assets/music/town.mp3','/assets/music/town.mp3'];
      AudioManager.init(musicCandidates[0], { autoplay:true, loop:true });
    }catch(e){ /* ignore */ }
    return renderUpgrades(root, {
      data,
      meta,
      buyUpgrade(id){
        const u = (data.upgrades||[]).find(x=>x.id===id || x.upgrade===id);
        if(!u) return;
        const res = buyUpgrade(meta, u);
        try{ saveMeta(meta); }catch(e){}
        // simple feedback via alert if available
        if(typeof window !== 'undefined' && window.alert){
          if(res && res.success) window.alert('Purchased '+(u.upgrade||u.id));
          else if(res && res.reason === 'prereq') window.alert('Cannot purchase: prerequisite not met');
          else window.alert('Cannot purchase: insufficient IP');
        }
        // re-render the upgrades screen
        navigate('arcade_upgrades');
      },
      buyLegendary(itemId){
        // look up the item in cards, summons, or legendary lists
        const findIn = (arr)=> (arr||[]).find(x=>x.id===itemId || x.name===itemId || x.upgrade===itemId);
        const item = findIn(data.cards) || findIn(data.summons) || findIn(data.legendary) || findIn(data.upgrades);
        if(!item) return;
        const res = buyLegendaryItem(meta, item);
        try{ saveMeta(meta); }catch(e){}
        if(typeof window !== 'undefined' && window.alert){
          if(res && res.success) window.alert('Purchased '+(item.name||item.upgrade||item.id));
          else window.alert('Cannot purchase: insufficient IP');
        }
        navigate('arcade_upgrades');
      },
      onBack: ()=> navigate('arcade_start')
    });
  });

  register('battle', (root, params)=> renderBattle(root, params));
  register('arcade_encounter_end', (root, params)=> renderEncounterEnd(root, params));
  register('arcade_howto', (root)=> renderHowTo(root, { data, meta, onBack: ()=> navigate('arcade_start') }));
  // Consolidate shop UI: redirect legacy `store` route to the canonical `arcade_upgrades` screen
  register('store', (root, params)=> navigate('arcade_upgrades'));
  register('arcade_end', (root, params)=> renderEnd(root, params));

  navigate('menu');

  // Initialize background music to menu track. Place your music file at `assets/music/menu.mp3`.
  try{
    const musicCandidates = ['./assets/music/menu.mp3','assets/music/menu.mp3','/assets/music/menu.mp3'];
    // Start with the first candidate; browsers will gracefully fail if missing.
    AudioManager.init(musicCandidates[0], { autoplay:true, loop:true });
    // Convenience helpers exposed for debugging or UI wiring
    window.toggleMusic = function(){ return AudioManager.toggle(); };
    window.setMusicVolume = function(v){ return AudioManager.setVolume(v); };
    window.isMusicEnabled = function(){ return AudioManager.isEnabled(); };
    // Quick SFX tester and controls
    window.playSfxTest = function(){ return AudioManager.playSfx(['./assets/sfx/player_attack.mp3','./assets/music/player_attack.mp3'], { volume: 1.0 }); };
    window.setSfxEnabled = function(on){ return AudioManager.setSfxEnabled(!!on); };
    window.isSfxEnabled = function(){ return AudioManager.sfxEnabled; };
  }catch(e){}

  // Ensure playback starts after a user gesture when the browser blocks autoplay.
  (function ensureGestureStart(){
    try{
      const events = ['pointerdown','keydown','touchstart','click'];
      const handler = function(){
        try{ AudioManager.play(); }catch(e){}
        events.forEach(ev => window.removeEventListener(ev, handler));
      };
      events.forEach(ev => window.addEventListener(ev, handler, { passive: true }));
    }catch(e){ /* ignore */ }
  })();

  // Floating stats button removed — stats button is shown only on the start (menu) screen
}

let RNG = createRNG();

async function startRun({seed, deckIds} = {}){
  if(seed) RNG = createRNG(seed);
  let chosen = (deckIds && deckIds.length>0) ? deckIds : ((meta && Array.isArray(meta.ownedCards) && meta.ownedCards.length>0) ? meta.ownedCards.slice() : data.cards.filter(c=>c.starter).map(c=>c.id));
  // Ensure the player has starter summons available for the run if none are owned
  try{
    if(!(meta && Array.isArray(meta.ownedSummons) && meta.ownedSummons.length > 0)){
      meta.ownedSummons = (data.summons||[]).filter(s=>s && s.starter).map(s=>s.id);
      saveMeta(meta);
    }
  }catch(e){ /* ignore */ }
  // Track characters taken on a run (increment per-run usage)
  try{
    meta.characterUsage = meta.characterUsage || {};
    chosen.forEach(id=>{ meta.characterUsage[id] = (meta.characterUsage[id] || 0) + 1; });
    saveMeta(meta);
  }catch(e){ /* ignore */ }
  // Reset once-per-run usage tracking (e.g., legendary summons) at run start
  try{
    meta.summonUsage = {};
    saveMeta(meta);
  }catch(e){ /* ignore */ }
  const session = createEncounterSession(0, chosen, RNG);
  navigate('battle', session.ctx);
}

loadData().then(appStart).catch(err=>{document.getElementById('app').textContent='Load error: '+err});
