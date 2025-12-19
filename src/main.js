import { createRNG } from './engine/rng.js';
import { buildDeck } from './engine/deck.js';
import { startEncounter, playHeroAttack, playHeroAction, enemyAct, isFinished, placeHero, replaceHero, useSummon, defendHero } from './engine/encounter.js';
import { createMeta, buyUpgrade, buyLegendaryItem, loadMeta, saveMeta } from './engine/meta.js';
import { AudioManager } from './engine/audio.js';
import { register, navigate } from './ui/router.js';
import { renderStart } from './ui/screens/start.js';
import { renderStats } from './ui/screens/stats.js';
import { renderUpgrades } from './ui/screens/upgrades.js';
import { renderBattle } from './ui/screens/battle.js';
import { renderStore } from './ui/screens/store.js';
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
  const upgrades = await fetchAny([
    './data/upgrades.json', 'data/upgrades.json', '/data/upgrades.json'
  ]);

  data.cards = cards; data.summons = summons; data.enemies = enemies; data.upgrades = upgrades;
}

function appStart(){
  // On first-ever run, grant starter ownership if none present
  try{
    if((meta.runs||0) === 0){
      if(Array.isArray(meta.ownedCards) && meta.ownedCards.length === 0){
        meta.ownedCards = (data.cards||[]).filter(c=>c && c.starter).map(c=>c.id);
      }
      if(Array.isArray(meta.ownedSummons) && meta.ownedSummons.length === 0){
        meta.ownedSummons = (data.summons||[]).filter(s=>s && s.starter).map(s=>s.id);
      }
      saveMeta(meta);
    }
  }catch(e){}
  register('start', (root)=> {
    // Switch to menu music when entering the start screen
    try{
      const musicCandidates = ['./assets/music/menu.mp3','assets/music/menu.mp3','/assets/music/menu.mp3'];
      AudioManager.init(musicCandidates[0], { autoplay:true, loop:true });
    }catch(e){ /* ignore */ }
    return renderStart(root, {
      data,
      meta,
      selectCard(id){ console.log('selected',id); },
      onStartRun(opts){ startRun(opts); },
      onShowStats(){ navigate('stats'); },
      onShowUpgrades(){ navigate('upgrades'); },
      onDebugGrant(){
        try{ meta.ip = (meta.ip||0) + 10000; saveMeta(meta); }catch(e){ console.warn('debug grant failed', e); }
        navigate('start');
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
        }catch(e){ console.warn('debug unlock failed', e); }
        navigate('start');
      }
      ,
      onDebugUnlockTown(){
        try{
          meta.totalIpEarned = Math.max(1, (meta.totalIpEarned||0));
          saveMeta(meta);
        }catch(e){ console.warn('debug unlock town failed', e); }
        navigate('start');
      }
    });
  });


  register('stats', (root)=> renderStats(root, { data, meta, onBack: ()=> navigate('start') }));

  register('upgrades', (root)=> {
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
          else window.alert('Cannot purchase: insufficient IP');
        }
        // re-render the upgrades screen
        navigate('upgrades');
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
        navigate('upgrades');
      },
      onBack: ()=> navigate('start')
    });
  });

  register('battle', (root, params)=> renderBattle(root, params));
  register('encounter_end', (root, params)=> renderEncounterEnd(root, params));
  // Consolidate shop UI: redirect legacy `store` route to the canonical `upgrades` screen
  register('store', (root, params)=> navigate('upgrades'));
  register('end', (root, params)=> renderEnd(root, params));

  navigate('start');

  // Initialize background music to menu track. Place your music file at `assets/music/menu.mp3`.
  try{
    const musicCandidates = ['./assets/music/menu.mp3','assets/music/menu.mp3','/assets/music/menu.mp3'];
    // Start with the first candidate; browsers will gracefully fail if missing.
    AudioManager.init(musicCandidates[0], { autoplay:true, loop:true });
    // Convenience helpers exposed for debugging or UI wiring
    window.toggleMusic = function(){ return AudioManager.toggle(); };
    window.setMusicVolume = function(v){ return AudioManager.setVolume(v); };
    window.isMusicEnabled = function(){ return AudioManager.isEnabled(); };
  }catch(e){ console.warn('Background music init failed', e); }

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
  // Track characters taken on a run (increment per-run usage)
  try{
    meta.characterUsage = meta.characterUsage || {};
    chosen.forEach(id=>{ meta.characterUsage[id] = (meta.characterUsage[id] || 0) + 1; });
    saveMeta(meta);
  }catch(e){ /* ignore */ }
  let deck = buildDeck(data.cards, chosen, RNG);
  let currentEnemyIndex = 0;
  let enemy = data.enemies[currentEnemyIndex];
  let encounter = startEncounter({...enemy}, deck, RNG, { apPerTurn: 3 });

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
      ctx.onStateChange();
      if(timeout) setTimeout(()=>{ if(ctx.message===msg){ ctx.message=''; ctx.onStateChange(); } }, timeout);
    },
    dismissMessage(){ ctx.message=''; ctx.onStateChange(); },
    clearMessageHistory(){ ctx.messageHistory = []; ctx.onStateChange(); },
    placeHero(card){
      const res = placeHero(encounter, card);
      if(res.success){ if(ctx.setMessage) ctx.setMessage('Placed '+(card.name||card.id)+' in space '+(res.slot+1)); }
      else { if(ctx.setMessage) ctx.setMessage('No unoccupied space'); }
      return res;
    },
    playHeroAttack(slot){
      const res = playHeroAttack(encounter, slot);
      if(!res.success){ if(ctx.setMessage) ctx.setMessage(res.reason||'Attack failed'); }
      else { if(ctx.setMessage) ctx.setMessage('Hero dealt '+res.dmg+' damage. Enemy HP: '+res.enemyHp); }
      return res;
    },
    playHeroAction(slot, targetIndex){
      const res = playHeroAction(encounter, slot, targetIndex);
      if(!res.success){ if(ctx.setMessage) ctx.setMessage(res.reason||'Action failed'); }
      else {
        if(res.type === 'attack'){ if(ctx.setMessage) ctx.setMessage('Hero dealt '+res.dmg+' damage. Enemy HP: '+res.enemyHp); }
        else if(res.type === 'heal'){ if(ctx.setMessage) ctx.setMessage('Hero healed '+res.healed+' HP (now '+res.hp+')'); }
        else if(res.type === 'support' && res.refreshed === 'volo') {
          if(ctx.setMessage) ctx.setMessage("Support active: Volo ability available again");
        } else if(res.type === 'support') {
          if(ctx.setMessage) ctx.setMessage('Support active: will be targeted by next single-target enemy attack');
        }
      }
      return res;
    },
    defendHero(slot){
      const res = defendHero(encounter, slot);
      if(!res.success){ if(ctx.setMessage) ctx.setMessage(res.reason||'Defend failed'); }
      else { if(ctx.setMessage) ctx.setMessage('Hero is defending'); }
      return res;
    },
    replaceHero(slot, card){
      const res = replaceHero(encounter, slot, card);
      if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'Replace failed'); }
      else { if(ctx.setMessage) ctx.setMessage('Replaced space '+(slot+1)+' with '+(card.name||card.id)); }
      return res;
    },
    useSummon(id, targetIndex=null){
      const s = data.summons.find(x=>x.id===id);
      const r = useSummon(encounter,s,targetIndex);
      if(!r.success){ if(ctx.setMessage) ctx.setMessage(r.reason||'Summon failed'); }
      else { if(ctx.setMessage) ctx.setMessage('Summon: '+(s.name||s.id)+' used'); }
      // track summon usage
      try{
        if(r.success && s && s.id){
          meta.summonUsage = meta.summonUsage || {};
          meta.summonUsage[s.id] = (meta.summonUsage[s.id] || 0) + 1;
          saveMeta(meta);
        }
      }catch(e){ /* ignore */ }
      return r;
    },
    runSummary,
    currentEnemyIndex,
    endTurn(){
      const res = enemyAct(encounter);
      // process events for messaging
      let messages = [];
      if(res && res.events && res.events.length) {
        messages = res.events.map(ev => {
          if(ev.type === 'stunned') return ev.msg;
          if(ev.type === 'hit') {
              const name = ev.heroName || (encounter.playfield[ev.slot] && encounter.playfield[ev.slot].base && encounter.playfield[ev.slot].base.name) || ('space ' + (ev.slot+1));
              const totalDmg = (ev.tempTaken||0)+(ev.hpTaken||0);
              const attackPrefix = ev.attackName ? ('Enemy used ' + ev.attackName + ' and ') : '';
              if(ev.died) return attackPrefix + 'hit ' + name + ' for ' + totalDmg + ' and killed it';
              if(totalDmg === 0) return attackPrefix + 'attacked ' + name + ' but dealt no damage';
              return attackPrefix + 'hit ' + name + ' for ' + totalDmg + ', remaining HP: ' + ev.remainingHp;
            }
          return null;
        }).filter(Boolean);
      }
      // If no messages were generated, show a fallback
      if (!messages.length) {
        if (res && res.did === 'enemyStunned') {
          messages = ['Enemy stunned and skipped its turn'];
        } else if (res && res.did === 'enemyAct') {
          messages = ['Enemy could not attack (no targets)'];
        } else {
          messages = ['Enemy turn passed'];
        }
      }
      if(messages.length) ctx.setMessage(messages.join('\n'), 1000); // 1 second for enemy actions
      const finished = isFinished(encounter).winner;
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
            // advance to next enemy if available
            currentEnemyIndex += 1;
            if(currentEnemyIndex < (data.enemies||[]).length){
              enemy = data.enemies[currentEnemyIndex];
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
                deck = buildDeck(data.cards, rebuildIds, RNG);
              }catch(e){ console.warn('Failed to rebuild deck for next encounter', e); }
              encounter = startEncounter({...enemy}, deck, RNG, { apPerTurn: 3 });
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
              const endCtx = { data, runSummary, onRestart: ()=> navigate('start') };
              // prevent any pending timeouts or future onStateChange calls from re-rendering the battle
              ctx.onStateChange = ()=>{};
              ctx.setMessage = ()=>{};
              navigate('end', endCtx);
              return;
            }
          }
        };
        navigate('encounter_end', encounterEndCtx);
        return;
      } else if(finished === 'enemy'){
        // record death
        const enemyKey = encounter.enemy.id || encounter.enemy.name || 'unknown';
        runSummary.diedTo = enemyKey;
        // update run stats (failed run)
        try{ 
          meta.runs = (meta.runs||0) + 1; 
          meta.furthestReachedEnemy = Math.max((meta.furthestReachedEnemy||0), currentEnemyIndex);
          // increment per-enemy victory count
          meta.enemyVictoryCounts = meta.enemyVictoryCounts || {};
          meta.enemyVictoryCounts[enemyKey] = (meta.enemyVictoryCounts[enemyKey] || 0) + 1;
          saveMeta(meta); 
        }catch(e){}
        const endCtx = { data, runSummary, onRestart: ()=> navigate('start') };
        // prevent any pending timeouts or future onStateChange calls from re-rendering the battle
        ctx.onStateChange = ()=>{};
        ctx.setMessage = ()=>{};
        console.log('Encounter finished: enemy wins, navigating to end screen', runSummary);
        navigate('end', endCtx);
        return;
      }
      // otherwise continue same encounter
      navigate('battle', ctx);
    },
    onStateChange(){ navigate('battle', ctx); }
  };
  navigate('battle', ctx);
}

loadData().then(appStart).catch(err=>{document.getElementById('app').textContent='Load error: '+err});
