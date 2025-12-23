import { el, cardTile } from '../renderer.js';
import { navigate } from '../router.js';
import { AudioManager } from '../../engine/audio.js';
import { saveMeta } from '../../engine/arcade_meta.js';

function slotNode(slotObj, idx, handlers={}, highlight=false, targetHighlight=false, ctx=null){
  const container = el('div',{class:'card-wrap panel'});
  // expose slot index for drag-drop hit-testing
  try{ container.dataset.slot = String(idx); }catch(e){}
  if(highlight) container.classList.add('pending-slot');
  if(targetHighlight) container.classList.add('pending-target');
  if(!slotObj){
    // mark this wrapper as an empty slot so CSS can size/center the placeholder
    container.classList.add('empty-slot');
    const empty = el('div',{class:'muted empty-label'},['Space '+(idx+1)]);
    container.appendChild(empty);
    container.addEventListener('click',()=>{ if(handlers.onSelect) handlers.onSelect(idx); else if(handlers.onClick) handlers.onClick(idx); });
    return container;
  }
  // hero image tile (show current HP in the card stats) and temp HP badge
  const opts = { currentHp: slotObj.hp, tempHp: slotObj.tempHp, hideSlot: true, hideCost: true, hideAbilities: true };
  // if this hero is Griff and the encounter selected a variant, pass imageOverride
  try{
    const id = (slotObj.base && slotObj.base.id) ? slotObj.base.id : null;
    // For Griff, reuse a single persisted variant so re-renders (e.g. button presses)
    // don't change the image. Prefer ctx.meta.griffVariant, then localStorage,
    // then any encounter-provided _griffImage, otherwise pick one once and store it.
    if(id === 'griff'){
      // Prefer encounter-level variant (set when the battle starts) so image
      // remains stable for the duration of the encounter. Fall back to
      // meta/localStorage only if encounter variant is not present.
      let v = null;
      try{ if(ctx && ctx.encounter && typeof ctx.encounter._griffVariant === 'number') v = ctx.encounter._griffVariant; }catch(e){}
      try{ if(!v && ctx && ctx.meta && ctx.meta.griffVariant) v = ctx.meta.griffVariant; }catch(e){}
      try{ if(!v && typeof localStorage !== 'undefined'){ const ls = localStorage.getItem('griffVariant'); if(ls) v = Number(ls); } }catch(e){}
      try{ if(!v && ctx && ctx.encounter && ctx.encounter._griffImage){ const m = String(ctx.encounter._griffImage).match(/griff(\d+)\.png/i); if(m && m[1]) v = Number(m[1]); } }catch(e){}
      if(!v){
        // As a last resort, pick one for this encounter and persist it on the encounter
        v = Math.floor(Math.random() * 7) + 1;
        try{ if(ctx && ctx.encounter) ctx.encounter._griffVariant = v; }catch(e){}
      }
      opts.imageOverride = './assets/griff' + v + '.png';
    }
  }catch(e){}
  // build action buttons as the card footer so they sit close to the HP/stats
  const btns = el('div',{class:'row card-footer'});
  // when a hero is in the slot, show one button per defined ability (fallback to single generic Action)
  try{
    if(slotObj.base && Array.isArray(slotObj.base.abilities) && slotObj.base.abilities.length>0){
      slotObj.base.abilities.forEach((a, ai)=>{
        // Prefer the explicit ability `name` when present, otherwise fall back
        // to the legacy `ability` text or a generic label.
        const label = (a && a.name) ? a.name : ((a && a.ability) ? a.ability : ('Ability '+(ai+1)));
        const b = el('button',{class:'btn slot-action ability-btn', 'data-ability-index': String(ai)},[ label ]);
        // disable if not enough AP
        if(handlers.ap !== undefined && handlers.ap < 1) b.setAttribute('disabled','');
        // disable if ability is on cooldown (per-hero id)
        try{
          // ability cooldowns are tracked per-cardId+ability index ("<cardId>:ability<index>")
          const inst = (slotObj && slotObj.cardId) ? slotObj.cardId : String(idx);
          const key = String(inst) + ':ability' + String(ai);
          const cd = (ctx && ctx.encounter && ctx.encounter.abilityCooldowns) ? Number(ctx.encounter.abilityCooldowns[key] || 0) : 0;
          if(cd > 0){
            b.setAttribute('disabled','');
            b.setAttribute('title', 'Cooldown: '+String(cd)+' turns');
            try{
              const badge = el('span',{class:'ability-cooldown-badge'},[ String(cd) ]);
              b.appendChild(badge);
            }catch(e){}
          }
        }catch(e){}
        b.addEventListener('click',(e)=>{ e.stopPropagation(); if(handlers.onAction) handlers.onAction(idx, ai); });
        btns.appendChild(b);
      });
    } else {
      const act = el('button',{class:'btn slot-action'},['Action']);
      if(handlers.ap !== undefined && handlers.ap < 1) act.setAttribute('disabled','');
      act.addEventListener('click',(e)=>{ e.stopPropagation(); if(handlers.onAction) handlers.onAction(idx); });
      btns.appendChild(act);
    }
  }catch(e){}
  // also provide a Dodge button for placed characters
  const defend = el('button',{class:'btn slot-action dodge-btn'},['Dodge']);
  if(handlers.ap !== undefined && handlers.ap < 1) defend.setAttribute('disabled','');
  defend.addEventListener('click',(e)=>{ e.stopPropagation(); if(handlers.onDefend) handlers.onDefend(idx); });
  btns.appendChild(defend);
  // pass the built footer into the card tile so it anchors directly inside the card
  opts.footer = btns;
  const tile = cardTile(slotObj.base, opts);
  // ensure tile can host absolute-positioned overlays
  try{ tile.style.position = tile.style.position || 'relative'; }catch(e){}
  container.appendChild(tile);
  // Ordered status overlay: if `statusIcons` exists, render them left-to-right
  try{
    const icons = slotObj.statusIcons || [];
    if(icons && icons.length > 0){
      // Render overlays inside the card tile so they float over the image
      const overlay = el('div',{class:'status-overlay'} ,[]);
      icons.forEach(ic=>{
        try{
          const id = ic && ic.id ? String(ic.id) : '?';
          const emoji = (id === 'assist') ? '🎯' : (id === 'defend') ? '💨' : (id === 'help') ? '🕷️' : (id === 'protected') ? '🌪' : (id === 'lumalia') ? '🕓' : (id === 'stunned') ? '💫' : (id === 'enfeebled') ? '⬇️' : (id === 'blind') ? '😵' : id[0];
          // Build a human-readable tooltip title and aria-label
          let titleText = '';
          switch(id){
            case 'assist':
              titleText = 'Assist — +' + Math.round((ic && ic.amount? ic.amount*100 : 20)) + '% hit';
              break;
            case 'defend':
              titleText = 'Defend — Dodge (increased chance to avoid next attack)';
              break;
            case 'help':
              titleText = 'Help — Preferred target (enemy more likely to attack)';
              break;
            case 'protected':
              titleText = 'Gaseous Form — Invulnerable' + (ic && ic.turns ? (' ('+ic.turns+' turn'+(ic.turns>1?'s':'')+')') : '');
              break;
            case 'stunned':
              titleText = 'Stunned — cannot act' + (ic && ic.turns ? (' for '+ic.turns+' turn'+(ic.turns>1?'s':'')) : '');
              break;
            case 'enfeebled':
              titleText = 'Enfeebled — physical attacks deal half damage' + (ic && ic.turns ? (' for '+ic.turns+' turn'+(ic.turns>1?'s':'')) : '');
              break;
            case 'lumalia':
              titleText = 'Lumalia — Pending ' + (ic && ic.dmg ? ic.dmg : '') + ' damage';
              break;
            case 'blind':
            case 'blinded':
              titleText = 'Blinded — 50% miss chance' + (ic && ic.turns ? (' for '+ic.turns+' turn'+(ic.turns>1?'s':'')) : '');
              break;
            default:
              titleText = (id.charAt(0).toUpperCase()+id.slice(1)) + (ic && ic.source ? (' ('+ic.source+')') : '');
              break;
          }
          const icEl = el('div',{class:'status-icon', title: titleText, 'aria-label': titleText},[ emoji ]);
          overlay.appendChild(icEl);
        }catch(e){}
      });
      tile.appendChild(overlay);
    }
  }catch(e){}
  // show a defend/shield badge when this hero is defending
  if(!(slotObj.statusIcons && slotObj.statusIcons.length>0)){
    if(slotObj.defending){
      const badge = el('div',{class:'defend-badge'},['💨']);
      try{ tile.appendChild(badge); }catch(e){ container.appendChild(badge); }
    }
    if(slotObj.helped){
      const helpBadge = el('div',{class:'help-badge'},['🕷️']);
      try{ tile.appendChild(helpBadge); }catch(e){ container.appendChild(helpBadge); }
    }
    // show an assist/hit-bonus badge when this hero received an accuracy buff
    try{
      if(slotObj.hitBonus && slotObj.hitBonus > 0){
        const assistBadge = el('div',{class:'assist-badge'},['🎯']);
        try{ tile.appendChild(assistBadge); }catch(e){ container.appendChild(assistBadge); }
      }
    }catch(e){}
  }
  
  container.addEventListener('click',()=>{ if(handlers.onSelect) handlers.onSelect(idx); else if(handlers.onClick) handlers.onClick(idx); });
  return container;
}

export function renderBattle(root, ctx){
  // Switch music to the appropriate battle track for this encounter.
  try{
    const enemy = (ctx && ctx.encounter && ctx.encounter.enemy) ? ctx.encounter.enemy : null;
    if(enemy){
      // Select a single music track for this encounter and persist it on the
      // render context so repeated re-renders (e.g. from button presses)
      // don't reinitialize or restart the music.
      // Persist the selected track on the encounter object (not the outer ctx)
      // so each enemy/encounter can have its own track instead of reusing the
      // first-chosen value for the entire run.
      if(!ctx.encounter._battleMusicSrc){
        if(enemy.id === 'vecna' || (enemy.name && /vecna/i.test(enemy.name))){
          ctx.encounter._battleMusicSrc = './assets/music/secret.mp3';
        } else if(enemy.id === 'twig_blight' || (enemy.name && /twig/i.test(enemy.name))){
          ctx.encounter._battleMusicSrc = './assets/music/battle_1.mp3';
        } else {
          const picks = ['battle_1.mp3','battle_2.mp3','battle_3.mp3'];
          const sel = picks[Math.floor(Math.random() * picks.length)];
          ctx.encounter._battleMusicSrc = `./assets/music/${sel}`;
        }
      }
      AudioManager.init(ctx.encounter._battleMusicSrc, { autoplay:true, loop:true });
    }
  }catch(e){ /* ignore audio init failures */ }

  // Music is controlled only by screen navigation; do not manipulate it on button presses.
  const hud = el('div',{class:'hud'},[]);
  // AP decrement visual: compare last known AP on ctx
  const apText = el('div',{class:'ap-display'},['AP: '+ctx.encounter.ap+'/'+ctx.encounter.apPerTurn]);
  const endRunBtn = el('button',{class:'btn end-run-btn'},['Give Up']);
  endRunBtn.addEventListener('click',()=>{
    const ok = window.confirm('Give up? This will forfeit current progress and return to the start screen.');
    if(!ok) return;
    try{ endRunBtn.setAttribute('disabled',''); }catch(e){}
    try{ if(ctx && ctx.meta) { ctx.meta.summonUsage = {}; saveMeta(ctx.meta); } }catch(e){ console.debug('GiveUp: saveMeta failed', e); }
    try{
      // Prevent any pending timeouts or callbacks from re-rendering the battle
      try{ if(ctx){ ctx.onStateChange = ()=>{}; ctx.setMessage = ()=>{}; } }catch(e){}
      navigate('arcade_start');
      console.debug('GiveUp: navigated to arcade_start');
      return;
    }catch(e){
      console.debug('GiveUp: navigate threw', e);
    }
    // Fallback: if navigate isn't available for some reason, perform a hard redirect
    try{ window.location.assign(window.location.pathname || '/'); }catch(e){ console.debug('GiveUp: forced assign failed', e); }
  });
  if(typeof ctx._lastAp === 'undefined') ctx._lastAp = ctx.encounter.ap;
  if(ctx._lastAp > ctx.encounter.ap){
    apText.classList.add('ap-decrement');
    setTimeout(()=>{ apText.classList.remove('ap-decrement'); }, 400);
  }
  ctx._lastAp = ctx.encounter.ap;
  hud.appendChild(apText);
  hud.appendChild(endRunBtn);
  root.appendChild(hud);

  // persistent history panel fixed at bottom-right
  // persistent history panel fixed at bottom-right
  const persistentHistory = el('div',{class:'panel msg-history persistent-bottom-right', style:'max-height:200px; overflow:auto;'},[]);
  // respect persisted collapsed state on ctx so re-renders keep it hidden
  if(ctx.historyCollapsed){ persistentHistory.classList.add('collapsed'); }
  function renderHistory(){
    // if collapsed, keep DOM minimal and avoid filling content until expanded
    if(ctx.historyCollapsed){ persistentHistory.innerHTML = ''; return; }
    persistentHistory.innerHTML = '';
    const hist = ctx.messageHistory || [];
    if(hist.length===0){
      persistentHistory.appendChild(el('div',{class:'muted'},['No messages']));
    } else {
      hist.forEach(h=>{ persistentHistory.appendChild(el('div',{class:'msg-item muted'},[new Date(h.ts).toLocaleTimeString()+': '+h.text])); });
    }
    const clear = el('button',{class:'btn history-clear'},['Clear History']);
    clear.addEventListener('click',()=>{ if(ctx.clearMessageHistory) ctx.clearMessageHistory(); renderHistory(); });
    persistentHistory.appendChild(clear);
  }
  renderHistory();
  root.appendChild(persistentHistory);

  // persistent history toggle (open / collapse)
  const historyToggle = el('button',{class:'btn history-toggle persistent-bottom-right', title:'Toggle History'},[ ctx.historyCollapsed? 'Show History' : 'Hide History' ]);
  historyToggle.addEventListener('click',()=>{
    ctx.historyCollapsed = !Boolean(ctx.historyCollapsed);
    // persist collapse state and re-render so the panel remains hidden until explicitly shown
      if(typeof ctx.onStateChange === 'function') ctx.onStateChange();
  });
  root.appendChild(historyToggle);

  // Floating music control (bottom-right)
  try{
    const musicBtn = el('button',{class:'btn music-btn floating icon', style:'position:fixed;right:18px;bottom:36px;z-index:10030;height:40px;display:flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:6px;background:linear-gradient(180deg,#10b981,#047857);color:#fff;border:1px solid rgba(0,0,0,0.12);font-size:22px', title:'Music'},[ el('span',{style:'font-size:22px;line-height:1;display:inline-block'},[ AudioManager.isEnabled() ? '🔊' : '🔈' ]) ]);
    const musicPanel = el('div',{class:'panel music-panel', style:'position:fixed;right:18px;bottom:76px;z-index:10030;display:none;padding:8px;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.25)'},[]);
    const volLabel = el('div',{},['Volume']);
    const volValue = Math.round((AudioManager.getVolume ? AudioManager.getVolume() : 0.6) * 100);
    const volInput = el('input',{type:'range', min:0, max:100, value: String(volValue), style:'width:160px;display:block'});
    volInput.addEventListener('input', (ev)=>{ const v = Number(ev.target.value || 0) / 100; AudioManager.setVolume(v); });
    musicPanel.appendChild(volLabel);
    musicPanel.appendChild(volInput);

    let panelTimer = null;
    function showPanel(){
      musicPanel.style.display = 'block';
      if(panelTimer) clearTimeout(panelTimer);
      panelTimer = setTimeout(()=>{ musicPanel.style.display = 'none'; panelTimer = null; }, 4000);
    }

    musicBtn.addEventListener('click', ()=>{ const on = AudioManager.toggle(); musicBtn.textContent = on ? '🔊' : '🔈'; showPanel(); });
    musicBtn.addEventListener('mouseover', showPanel);
    musicPanel.addEventListener('mouseover', ()=>{ if(panelTimer) clearTimeout(panelTimer); });
    musicPanel.addEventListener('mouseleave', ()=>{ if(panelTimer) clearTimeout(panelTimer); panelTimer = setTimeout(()=>{ musicPanel.style.display='none'; panelTimer=null; }, 1000); });

    root.appendChild(musicBtn);
    root.appendChild(musicPanel);
  }catch(e){ /* ignore if AudioManager unavailable */ }

  // Inline message area removed — cancel button is available as a persistent control
  const cancelPending = el('button',{class:'btn action-btn cancel-btn'},['Cancel Pending']);
  cancelPending.addEventListener('click',()=>{
    ctx.pendingReplace = null;
    ctx.pendingSummon = null;
    ctx.pendingAction = null;
    if(ctx.setMessage) ctx.setMessage('Pending action canceled');
    if(ctx.onStateChange) ctx.onStateChange();
  });
  
  // persistent bottom-left controls for Dismiss / Cancel Pending
  const persistentControls = el('div',{class:'persistent-controls-left'},[]);
  persistentControls.appendChild(cancelPending);
  root.appendChild(persistentControls);

  const panel = el('div',{class:'panel battle-panel'});
  // wrapper used to scale the entire battle UI uniformly
  const scaleWrap = el('div',{class:'battle-scale'},[]);
  scaleWrap.appendChild(panel);
  root.appendChild(scaleWrap);

  // Disable automatic UI scaling for the battle screen: keep fixed scale
  (function setupScale(){
    if(ctx._scaleSetup) return;
    try{ document.documentElement.style.setProperty('--ui-scale', '1'); }catch(e){}
    ctx._scaleSetup = true;
  })();

  // Summons renderer (kept as a function so we can render it later at the bottom)
  function createSummons(){
    const summonsWrap = el('div',{class:'panel summons-wrap'},[]);
    summonsWrap.appendChild(el('h3',{class:'summons-title'},['Summons']));
    const sGrid = el('div',{class:'card-grid summons-small'});
    const ownedSummons = (ctx.meta && Array.isArray(ctx.meta.ownedSummons)) ? ctx.meta.ownedSummons : [];
    // include legendary summons in the available pool if purchased
    const allSummons = ([]).concat(ctx.data.summons || [], ctx.data.legendary || []);
    const availableSummons = allSummons.filter(s => ownedSummons.includes(s.id));
    if(availableSummons.length === 0){
      sGrid.appendChild(el('div',{class:'muted'},['No summons available']));
    }
    availableSummons.forEach(s=>{
      // build the summon card (cardTile returns a `.card` element)
      const sOpts = { hideSlot: true, hideCost: true };
      try{ if(s && s.id === 'blackrazor') sOpts.imageOverride = './assets/blackrazor.png'; }catch(e){}
      const sCard = cardTile(s, sOpts);
      // shrink Blackrazor image in the summons panel by tagging the card
      if(s && s.id === 'blackrazor'){ try{ sCard.classList.add('blackrazor'); }catch(e){} }
      const used = ctx.encounter.summonUsed && ctx.encounter.summonUsed[s.id];
      const cd = ctx.encounter.summonCooldowns && (ctx.encounter.summonCooldowns[s.id]||0);
      // also consider once-per-run usage persisted in meta so legendary summons remain disabled across fights
      let usedForRun = false;
      try{
        if(s && s.restriction && typeof s.restriction === 'string' && s.restriction.toLowerCase().includes('once per run')){
          const mu = (ctx.meta && ctx.meta.summonUsage) ? ctx.meta.summonUsage[s.id] : 0;
          if(mu && mu > 0) usedForRun = true;
        }
      }catch(e){}
      const btnLabel = used ? 'Used' : (usedForRun ? 'Used (run)' : (cd>0 ? 'Cooldown: '+cd : 'Cast'));
      const btn = el('button',{class:'btn'},[ btnLabel ]);
      if(used || usedForRun || cd>0) btn.setAttribute('disabled','');
      btn.addEventListener('click',()=>{
        // prefer structured ability definition on summons too, fallback to legacy
        const sPrimary = (s && Array.isArray(s.abilities) && s.abilities.length>0) ? (s.abilities.find(a=>a.primary) || s.abilities[0]) : null;
        const needsTarget = /one target|target/i.test((sPrimary && sPrimary.ability) ? sPrimary.ability : (s.ability||'')) || s.id === 'blackrazor';
        if(needsTarget){
          ctx.pendingSummon = { id: s.id, name: s.name };
          if(ctx.setMessage) ctx.setMessage('Click a space to target '+s.name);
          ctx.onStateChange();
          return;
        }
        const res = ctx.useSummon(s.id);
        if(res && res.success){ ctx.onStateChange(); }
      });
      // insert the Cast button above the card content
      sCard.insertBefore(btn, sCard.firstChild);
      sGrid.appendChild(sCard);
    });
    summonsWrap.appendChild(sGrid);
    return summonsWrap;
  }

  // show enemy image (wrapped in enemyArea) -- will append after playfield
  // use the manual HP label insertion (keeps the old prominent HP display)
  // Provide an explicit image override for known enemy assets that may
  // have different filename casing or large dimensions to avoid rendering
  // glitches on some platforms (Acererak image uses capital A file).
  const enemyOpts = { hideSlot: true, hideHp: true };
  try{
    const enemyId = ctx.encounter.enemy && ctx.encounter.enemy.id;
    if(enemyId === 'acererak'){
      enemyOpts.imageOverride = './assets/acererak.png';
    }
  }catch(e){}
  const enemyCard = cardTile(ctx.encounter.enemy, enemyOpts);
  try{ if(ctx.encounter.enemy && ctx.encounter.enemy.id === 'acererak') enemyCard.classList.add('acererak'); }catch(e){}
  // insert a prominent HP label inside the enemy card before the image so it's visible
  const hpLabel = el('div',{class:'enemy-hp'},['HP: '+(ctx.encounter.enemy && ctx.encounter.enemy.hp)]);
  const enemyArea = el('div',{class:'enemy-area'},[]);
  // place HP immediately after the image inside the card if possible
  const imgEl = enemyCard.querySelector && enemyCard.querySelector('img');
  if(imgEl){
    if(imgEl.nextSibling) enemyCard.insertBefore(hpLabel, imgEl.nextSibling);
    else enemyCard.appendChild(hpLabel);
  } else {
    enemyCard.appendChild(hpLabel);
  }
  // show a floating attack label when the enemy recently used a named attack
  try{
    if(ctx._lastEnemyAttack && ctx._lastEnemyAttack.name){
      try{ enemyCard.style.position = enemyCard.style.position || 'relative'; }catch(e){}
      const lbl = el('div',{class:'enemy-attack-label'},[ String(ctx._lastEnemyAttack.name) ]);
      // position it relative to the image: top 10% of the card image area
      enemyCard.appendChild(lbl);
      // remove after animation completes to keep DOM clean
      setTimeout(()=>{ try{ if(lbl && lbl.parentNode) lbl.parentNode.removeChild(lbl); }catch(e){} }, 1000);
    }
  }catch(e){ /* ignore overlay failures */ }
  // show stun badge bottom-right when enemy is stunned
  const stunned = ctx.encounter.enemy && (ctx.encounter.enemy.stunnedTurns || 0) > 0;
  if(stunned){
    try{ enemyCard.style.position = enemyCard.style.position || 'relative'; }catch(e){}
    const st = ctx.encounter.enemy.stunnedTurns;
    const title = (!Number.isFinite(st)) ? 'Stunned: Rest of battle' : ('Stunned: '+(st||0)+' turns');
    const stunBadge = el('div',{class:'enemy-stun-badge', title},['💫']);
    enemyCard.appendChild(stunBadge);
  }
  enemyArea.appendChild(enemyCard);

  // Playfield display (3 slots) — front column: slots 1 & 2 stacked; back slot (behind): slot 3
  const playfield = el('div',{class:'panel playfield'},[]);
  // pendingReplace / pendingSummon persisted on ctx so they survive re-renders
  const pendingReplace = ctx.pendingReplace || null;
  const pendingSummon = ctx.pendingSummon || null;
  const pendingAction = ctx.pendingAction || null;
  const pendingAny = pendingReplace || pendingSummon || pendingAction || null;

  function makeSlot(i){
    const isTarget = Boolean(ctx.pendingAction && (ctx.pendingAction.type === 'heal' || ctx.pendingAction.type === 'willis') && ctx.encounter.playfield[i]);
    // Highlight logic:
    // - when in place mode: highlight only empty slots
    // - when in replace mode: highlight only occupied slots
    // - otherwise highlight when any pending action exists
    let highlight = Boolean(pendingAny);
    if(pendingReplace){
      if(pendingReplace.mode === 'place'){
        highlight = !Boolean(ctx.encounter.playfield[i]);
      } else if(pendingReplace.mode === 'replace'){
        highlight = Boolean(ctx.encounter.playfield[i]);
      }
    }
    const container = slotNode(ctx.encounter.playfield[i], i, {
      ap: ctx.encounter.ap,
      onAction(idx, abilityIndex){
        try{ if(ctx._lastEnemyAttack) delete ctx._lastEnemyAttack; }catch(e){}
        if(ctx.encounter.ap < 1) { if(ctx.setMessage) ctx.setMessage('Not enough AP'); return; }
        // detect explicit actionType if present
        const hero = ctx.encounter.playfield[idx];
        let primary = null;
        try{
          if(typeof abilityIndex === 'number' && hero && hero.base && Array.isArray(hero.base.abilities) && hero.base.abilities[abilityIndex]){
            primary = hero.base.abilities[abilityIndex];
          } else if(hero && hero.base && Array.isArray(hero.base.abilities) && hero.base.abilities.length>0){
            primary = hero.base.abilities.find(a=>a.primary) || hero.base.abilities[0];
          } else {
            primary = null;
          }
        }catch(e){ primary = null; }
        const actionType = (primary && primary.actionType) ? primary.actionType : (hero && hero.base && hero.base.actionType) ? hero.base.actionType : null;
        if(actionType === 'support'){
          // Determine if this support ability requires selecting a target
          // Prefer an explicit `requiresTarget` flag on the ability data when present
          let abilityText = '';
          try{ abilityText = (primary && (primary.ability || primary.name)) ? String(primary.ability || primary.name).toLowerCase() : ''; }catch(e){}
          let needsTarget = false;
          try{ if(primary && typeof primary.requiresTarget !== 'undefined'){ needsTarget = !!primary.requiresTarget; } else { needsTarget = /target|one target|select|ally|assist|click a space/i.test(abilityText); } }catch(e){ needsTarget = /target|one target|select|ally|assist|click a space/i.test(abilityText); }
          // Willis requires selecting a target to protect (explicit special-case)
          if(hero && hero.base && hero.base.id === 'willis'){
            ctx.pendingAction = { type: 'willis', from: idx, abilityIndex };
            if(ctx.setMessage) ctx.setMessage('Click a space to select a target to protect');
            ctx.onStateChange();
            return;
          }
          // If this support ability needs a target (e.g., Scout's Assist), set pendingAction
          if(needsTarget){
            ctx.pendingAction = { type: 'support_target', from: idx, abilityIndex };
            if(ctx.setMessage) ctx.setMessage('Click a space to select a target');
            ctx.onStateChange();
            return;
          }
          // immediate apply support (e.g., Piter's Help or Shalendra)
          const res = ctx.playHeroAction(idx, null, abilityIndex);
          if(!res.success){ if(ctx.setMessage) ctx.setMessage(res.reason||'Action failed'); }
          ctx.onStateChange();
          return;
        }
        // determine if this hero's action requires a target (common for single-target heals)
        const ability = (primary && primary.ability) ? String(primary.ability).toLowerCase() : ((hero && hero.base && hero.base.ability) ? hero.base.ability.toLowerCase() : '');
        const isHeal = /heal|cure|restore|regen|heals?/i.test(ability) || actionType === 'heal';
        const needsTarget = isHeal && /one target|one creature|target|other|ally/i.test(ability);
        if(needsTarget){
          // set pendingAction so the next space click becomes the heal target
          ctx.pendingAction = { type:'heal', from: idx, abilityIndex };
          if(ctx.setMessage) ctx.setMessage('Click a space to heal');
          ctx.onStateChange();
          return;
        }
        ctx.playHeroAction(idx, null, abilityIndex);
        ctx.onStateChange();
      },
      highlight,
      isTarget,
      ctx,
      onDefend(idx){
        try{ if(ctx._lastEnemyAttack) delete ctx._lastEnemyAttack; }catch(e){}
        if(ctx.encounter.ap < 1) { if(ctx.setMessage) ctx.setMessage('Not enough AP'); return; }
        if(typeof ctx.defendHero === 'function'){
          const res = ctx.defendHero(idx);
          if(!res || !res.success) { if(ctx.setMessage) ctx.setMessage((res && res.reason) || 'failed'); }
        } else {
          if(ctx.setMessage) ctx.setMessage('Dodge not implemented');
        }
        ctx.onStateChange();
      },
      onSelect(idx){
        try{ if(ctx._lastEnemyAttack) delete ctx._lastEnemyAttack; }catch(e){}
        // if summon pending, apply summon to this target
        if(pendingSummon){
          const res = ctx.useSummon(pendingSummon.id, idx);
          ctx.pendingSummon = null;
          ctx.onStateChange();
          return;
        }
        // if an action is pending (e.g., a heal or support-target), apply it to this target
        if(ctx.pendingAction && (ctx.pendingAction.type === 'heal' || ctx.pendingAction.type === 'support_target')){
          const from = ctx.pendingAction.from;
          const res = ctx.playHeroAction(from, idx, ctx.pendingAction.abilityIndex);
          if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
          ctx.pendingAction = null;
          ctx.onStateChange();
          return;
        }
        // Willis protection target selection
        if(ctx.pendingAction && ctx.pendingAction.type === 'willis'){
          const from = ctx.pendingAction.from;
          const res = ctx.playHeroAction(from, idx, ctx.pendingAction.abilityIndex);
          if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
          ctx.pendingAction = null;
          ctx.onStateChange();
          return;
        }
        if(!pendingReplace) return;
        const handIndex = pendingReplace.handIndex;
        if(typeof handIndex !== 'number'){ ctx.pendingReplace = null; ctx.onStateChange(); return; }
        // placing into a slot when in 'place' mode should target only empty slots
        if(pendingReplace.mode === 'place'){
          if(ctx.encounter.playfield[idx]){ if(ctx.setMessage) ctx.setMessage('Slot is occupied. Choose an empty slot or use Replace.'); return; }
          // remove the card from hand now that the player confirmed the slot
          const card = ctx.encounter.deck.playFromHand(handIndex);
          if(!card){ if(ctx.setMessage) ctx.setMessage('Card not available'); ctx.pendingReplace = null; ctx.onStateChange(); return; }
          const res = ctx.placeHeroAt(idx, card);
          if(!res.success){
            // on failure, return the card back to hand
            try{ ctx.encounter.deck.hand.push(card); }catch(e){}
            if(ctx.setMessage) ctx.setMessage(res.reason||'failed');
          }
          ctx.pendingReplace = null;
          ctx.onStateChange();
          return;
        }
        // replace mode (default behavior)
        // clicking an empty slot when replacing is invalid
        if(pendingReplace.mode === 'replace' && !ctx.encounter.playfield[idx]){ if(ctx.setMessage) ctx.setMessage('Slot is empty. Choose an occupied slot to replace.'); return; }
        if(ctx.encounter.ap < 1) { if(ctx.setMessage) ctx.setMessage('Not enough AP to replace'); ctx.pendingReplace = null; ctx.onStateChange(); return; }
        // remove the card from hand now that the player confirmed the slot
        const card = ctx.encounter.deck.playFromHand(handIndex);
        if(!card){ if(ctx.setMessage) ctx.setMessage('Card not available'); ctx.pendingReplace = null; ctx.onStateChange(); return; }
        // perform replacement (this will return the previous occupant to hand inside replaceHero)
        const res = ctx.replaceHero(idx, card);
        if(!res.success){
          // on failure, return the card back to hand
          try{ ctx.encounter.deck.hand.push(card); }catch(e){}
          if(ctx.setMessage) ctx.setMessage(res.reason||'failed');
        }
        ctx.pendingReplace = null;
        ctx.onStateChange();
      },
      onClick(idx){
        try{ if(ctx._lastEnemyAttack) delete ctx._lastEnemyAttack; }catch(e){}
        // clicking a slot same behavior as onSelect for pending actions
        if(pendingSummon){
          const res = ctx.useSummon(pendingSummon.id, idx);
          ctx.pendingSummon = null;
          ctx.onStateChange();
          return;
        }
        // handle pendingAction (heal) on click
        if(ctx.pendingAction && ctx.pendingAction.type === 'heal'){
          const from = ctx.pendingAction.from;
          const res = ctx.playHeroAction(from, idx, ctx.pendingAction.abilityIndex);
          if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
          ctx.pendingAction = null;
          ctx.onStateChange();
          return;
        }
        if(!pendingReplace) return;
        const handIndex = pendingReplace.handIndex;
        if(typeof handIndex !== 'number'){ ctx.pendingReplace = null; ctx.onStateChange(); return; }
        if(ctx.encounter.ap < 1) { if(ctx.setMessage) ctx.setMessage('Not enough AP to replace'); ctx.pendingReplace = null; ctx.onStateChange(); return; }
        // remove the card from hand now that the player confirmed the slot
        const card = ctx.encounter.deck.playFromHand(handIndex);
        if(!card){ if(ctx.setMessage) ctx.setMessage('Card not available'); ctx.pendingReplace = null; ctx.onStateChange(); return; }
        // if in replace mode, disallow targeting an empty slot
        if(pendingReplace.mode === 'replace' && !ctx.encounter.playfield[idx]){ if(ctx.setMessage) ctx.setMessage('Slot is empty. Choose an occupied slot to replace.'); ctx.pendingReplace = null; try{ ctx.encounter.deck.hand.push(card); }catch(e){} ctx.onStateChange(); return; }
        // perform replacement (this will return the previous occupant to hand inside replaceHero)
        const res = ctx.replaceHero(idx, card);
        if(!res.success){
          // on failure, return the card back to hand
          try{ ctx.encounter.deck.hand.push(card); }catch(e){}
          if(ctx.setMessage) ctx.setMessage(res.reason||'failed');
        }
        ctx.pendingReplace = null;
        ctx.onStateChange();
      }
    }, highlight, isTarget, ctx);

    // Show Lumalia pending-effect badge when her delayed effect is scheduled for this slot
    try{
      if(ctx && ctx.encounter && Array.isArray(ctx.encounter.pendingEffects)){
        const hasLum = ctx.encounter.pendingEffects.find(e => e && e.id === 'lumalia' && e.slot === i);
        if(!(ctx.encounter.playfield[i] && ctx.encounter.playfield[i].statusIcons && ctx.encounter.playfield[i].statusIcons.length>0)){
          if(hasLum){
            container.style.position = container.style.position || 'relative';
            const lumBadge = el('div',{class:'lumalia-badge', title: 'Lumalia: delayed effect'},['🕓']);
            container.appendChild(lumBadge);
          }
        }
      }
    }catch(e){}

    // Show Willis protection badge when a hero is currently protected
    try{
      const hero = ctx && ctx.encounter && ctx.encounter.playfield ? ctx.encounter.playfield[i] : null;
      if(!(hero && hero.statusIcons && hero.statusIcons.length>0)){
        if(hero && hero.protected && hero.protected.source === 'willis'){
          container.style.position = container.style.position || 'relative';
          const wBadge = el('div',{class:'willis-badge', title: 'Protected (Willis)'},['🌪']);
          container.appendChild(wBadge);
        }
      }
    }catch(e){}

    // Show a backline shield indicator when Formation 3 is active so players
    // can visually tell this slot won't be hit by AoE attacks.
    try{
      const formation = ctx && ctx.encounter && ctx.encounter.formation ? Number(ctx.encounter.formation) : 1;
      if(formation === 3 && i === 2){
        container.style.position = container.style.position || 'relative';
        const shield = el('div',{class:'backline-shield', title: 'Backline: immune to AoE in this formation'},['🛡️']);
        container.appendChild(shield);
      }
    }catch(e){}

    // Disable support action buttons for heroes whose support was already used this round
    try{
      const hero = ctx && ctx.encounter && ctx.encounter.playfield ? ctx.encounter.playfield[i] : null;
      const supportUsed = hero && hero.base && hero.base.id && ctx.encounter && ctx.encounter.supportUsed && ctx.encounter.supportUsed[hero.base.id];
      if(supportUsed){
        // disable any per-ability buttons that are support actions
        const abilityBtns = container.querySelectorAll ? Array.from(container.querySelectorAll('.ability-btn')) : [];
        abilityBtns.forEach(b => {
          try{
            const ai = Number(b.dataset && b.dataset.abilityIndex);
            const a = (hero && hero.base && Array.isArray(hero.base.abilities)) ? hero.base.abilities[ai] : null;
            if(a && String(a.actionType).toLowerCase() === 'support') b.setAttribute('disabled','');
          }catch(e){}
        });
        // also handle legacy single Action button (no data-ability-index)
        const genericBtns = container.querySelectorAll ? Array.from(container.querySelectorAll('.slot-action')) : [];
        genericBtns.forEach(b => {
          try{
            if(typeof b.dataset === 'undefined' || typeof b.dataset.abilityIndex === 'undefined'){
              const primary = (hero && hero.base) ? ((Array.isArray(hero.base.abilities) && hero.base.abilities.length>0) ? (hero.base.abilities.find(a=>a.primary) || hero.base.abilities[0]) : null) : null;
              if(primary && String(primary.actionType).toLowerCase() === 'support') b.setAttribute('disabled','');
            }
          }catch(e){}
        });
      }
    }catch(e){}

    return container;
  }

  // helper to populate playfield DOM based on formation value
  function populatePlayfield(formation){
    // clear existing content
    playfield.innerHTML = '';
    // recreate slots fresh so event handlers and highlights reflect current state
    const s0 = makeSlot(0);
    const s1 = makeSlot(1);
    const s2 = makeSlot(2);

    if(Number(formation) === 2){
      const leftStack = el('div',{class:'playfield-left'},[]);
      leftStack.appendChild(s1);
      leftStack.appendChild(s2);
      const rightCenter = el('div',{class:'playfield-right'},[]);
      rightCenter.appendChild(s0);
      playfield.appendChild(leftStack);
      playfield.appendChild(rightCenter);
    } else if(Number(formation) === 3){
      // Formation 3: line up slots horizontally with slot0 in front (nearest enemy),
      // then slot1 behind, then slot2 furthest back.
      const row = el('div',{class:'playfield-row'},[]);
      // append in back-to-front order so z-index CSS can layer them correctly
      row.appendChild(s2);
      row.appendChild(s1);
      row.appendChild(s0);
      playfield.appendChild(row);
    } else {
      // default layout: back (slot 2) on left, front column contains slot 0 then slot 1
      const backSlotWrap = el('div',{class:'playfield-back'},[]);
      const frontCol = el('div',{class:'playfield-front'},[]);
      backSlotWrap.appendChild(s2);
      frontCol.appendChild(s0);
      frontCol.appendChild(s1);
      playfield.appendChild(backSlotWrap);
      playfield.appendChild(frontCol);
    }
  }

  // determine formation (may be set on ctx.encounter)
  const initialFormation = (ctx && ctx.encounter && ctx.encounter.formation) ? Number(ctx.encounter.formation) : 1;
  // ensure the playfield has the formation class so CSS rules apply
  try{ if(playfield && typeof playfield.classList !== 'undefined'){ playfield.classList.add('formation-'+String(initialFormation)); } }catch(e){}
  populatePlayfield(initialFormation);
  // append playfield (labeled 'Grid') left, enemy on the right inside a top row
  const topRow = el('div',{class:'battle-top'},[]);
  const leftCol = el('div',{},[]);
  // Party formation header with selectable formation buttons (1 = default)
  const formationCurrent = (ctx && ctx.encounter && ctx.encounter.formation) ? Number(ctx.encounter.formation) : 1;
  const headerRow = el('div',{class:'slot-header-row', style:'display:flex;align-items:center;gap:12px;'},[]);
  const title = el('h3',{class:'slot-header'},['Party Formation']);
  const controls = el('div',{class:'formation-controls'},[]);
  [1,2,3].forEach(n=>{
    const btn = el('button',{class:'btn formation-btn' + (n===formationCurrent ? ' selected' : ''), 'data-formation': String(n)},[ String(n) ]);
    // Determine ownership: formation 1 is always available; 2 and 3 require upgrades
    let owned = true;
    try{
      const purchased = (ctx.meta && Array.isArray(ctx.meta.purchasedUpgrades)) ? ctx.meta.purchasedUpgrades : [];
      if(n === 2) owned = purchased.includes('formation_2');
      if(n === 3) owned = purchased.includes('formation_3');
    }catch(e){ owned = true; }
    if(!owned){ btn.setAttribute('disabled',''); btn.classList.add('locked'); btn.title = (n===2 ? 'Purchase in Metagame to unlock Formation 2' : 'Purchase in Metagame to unlock Formation 3 (requires Formation 2)'); }
    btn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      // If locked, prompt the player to buy in the metagame store
      if(btn.hasAttribute('disabled')){
        try{ if(ctx.setMessage) ctx.setMessage('Purchase this formation in the Metagame store to unlock'); }catch(e){}
        return;
      }
      const f = Number(btn.dataset.formation || n);
      try{ if(!ctx.encounter) ctx.encounter = {}; ctx.encounter.formation = f; }catch(e){}
      // update playfield class to reflect formation
      try{
        const pf = playfield;
        if(pf){ pf.classList.remove('formation-1','formation-2','formation-3'); pf.classList.add('formation-'+String(f)); }
        // rebuild the playfield DOM for the new formation
        try{ if(typeof populatePlayfield === 'function') populatePlayfield(f); }catch(e){ console.debug('populatePlayfield failed', e); }
      }catch(e){}
      // update selected state of buttons
      try{ Array.from(controls.querySelectorAll('.formation-btn')).forEach(b=>{ b.classList.toggle('selected', Number(b.dataset.formation)===f); }); }catch(e){}
      if(typeof ctx.onStateChange === 'function') ctx.onStateChange();
    });
    controls.appendChild(btn);
  });
  headerRow.appendChild(title);
  headerRow.appendChild(controls);
  // place formation controls in the HUD below the AP display (before Give Up)
  try{ if(hud && endRunBtn) hud.insertBefore(headerRow, endRunBtn); else leftCol.appendChild(headerRow); }catch(e){ try{ leftCol.appendChild(headerRow); }catch(e){} }
  // ensure playfield gets initial formation class
  try{ playfield.classList.add('formation-'+String(formationCurrent)); }catch(e){}
  leftCol.appendChild(playfield);
  topRow.appendChild(leftCol);
  topRow.appendChild(enemyArea);
  panel.appendChild(topRow);

  

  // Hand with inline action buttons (label added)
  const handWrap = el('div',{class:'panel hand-wrap'},[]);
  handWrap.appendChild(el('h3',{class:'hand-title'},['Party']));
  const handGrid = el('div',{class:'card-grid'},[]);
    // helper: start a pointer-based drag from a hand card
    function startDragFromHand(handIndex, cardWrap){
      const card = ctx.encounter.deck.hand[handIndex];
      if(!card){ if(ctx.setMessage) ctx.setMessage('Card not available'); return; }
      try{ if(ctx._lastEnemyAttack) delete ctx._lastEnemyAttack; }catch(e){}
      ctx.pendingReplace = { handIndex, mode: 'place' };
      if(ctx.setMessage) ctx.setMessage('Drag the card to an empty space to place it');
      ctx.onStateChange && ctx.onStateChange();

      const origCardEl = cardWrap.querySelector && cardWrap.querySelector('.card');
      // Create a lightweight clone that only displays the card name while dragging
      const clone = origCardEl ? origCardEl.cloneNode(true) : document.createElement('div');
      // Strip clone content down to the `.card-name` (or fallback to card.name)
      try{
        let nameEl = null;
        if(origCardEl) nameEl = origCardEl.querySelector('.card-name') || origCardEl.querySelector('.summon-name');
        clone.innerHTML = '';
        if(nameEl){ clone.appendChild(nameEl.cloneNode(true)); }
        else { clone.textContent = (card && (card.name || card.id)) ? (card.name || card.id) : 'Card'; }
      }catch(e){ /* ignore name extraction failures */ }

      clone.style.position = 'fixed';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '10050';
      // give the name-clone a compact size instead of copying the full card width
      try{ clone.style.width = 'auto'; }catch(e){}
      clone.classList.add('dragging-card');
      // Slightly compact visual style for the name-only clone
      clone.style.padding = '6px 10px';
      clone.style.background = 'linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.4))';
      clone.style.borderRadius = '8px';
      clone.style.color = '#fff';
      clone.style.fontWeight = '800';
      document.body.appendChild(clone);
      try{ document.body.classList.add('dragging-active'); }catch(e){}

      let lastX = 0, lastY = 0;
      function move(ev){
        lastX = ev.clientX; lastY = ev.clientY;
        clone.style.left = (ev.clientX + 8) + 'px';
        clone.style.top = (ev.clientY + 8) + 'px';
        try{
          const elUnder = document.elementFromPoint(ev.clientX, ev.clientY);
          document.querySelectorAll('.card-wrap.panel.pending-slot-hover').forEach(n=>n.classList.remove('pending-slot-hover'));
          if(elUnder){
            const slotEl = elUnder.closest && elUnder.closest('.card-wrap.panel');
            if(slotEl && typeof slotEl.dataset !== 'undefined'){
              const si = Number(slotEl.dataset.slot);
              if(Number.isFinite(si)){
                const empty = !ctx.encounter.playfield[si];
                if(empty) slotEl.classList.add('pending-slot-hover');
              }
            }
          }
        }catch(e){}
      }

      function up(){
        document.querySelectorAll('.card-wrap.panel.pending-slot-hover').forEach(n=>n.classList.remove('pending-slot-hover'));
        const elUnder = document.elementFromPoint(lastX, lastY);
        if(elUnder){
          const slotEl = elUnder.closest && elUnder.closest('.card-wrap.panel');
          if(slotEl && typeof slotEl.dataset !== 'undefined'){
            const si = Number(slotEl.dataset.slot);
            if(Number.isFinite(si)){
              if(!ctx.encounter.playfield[si]){
                const taken = ctx.encounter.deck.playFromHand(handIndex);
                if(!taken){ if(ctx.setMessage) ctx.setMessage('Card not available'); }
                else {
                  const res = ctx.placeHeroAt(si, taken);
                  if(!res || !res.success){ try{ ctx.encounter.deck.hand.push(taken); }catch(e){} if(ctx.setMessage) ctx.setMessage(res && res.reason ? res.reason : 'Place failed'); }
                }
              } else {
                if(ctx.setMessage) ctx.setMessage('Slot is occupied.');
              }
            }
          }
        }
        try{ document.body.removeChild(clone); }catch(e){}
        try{ document.body.classList.remove('dragging-active'); }catch(e){}
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        ctx.pendingReplace = null;
        ctx.onStateChange && ctx.onStateChange();
      }

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    ctx.encounter.deck.hand.forEach((c,i)=>{
      const cardWrap = el('div',{class:'card-wrap panel'});
      cardWrap.appendChild(cardTile(c, { hideCost: true, hideSlot: true }));

      const actions = el('div',{class:'row'},[]);
          const placeBtn = el('button',{class:'btn slot-action'},['Place']);
          placeBtn.addEventListener('click',()=>{ startDragFromHand(i, cardWrap); });
      actions.appendChild(placeBtn);

      // allow pointerdown on the card itself to begin drag (ignore clicks on buttons)
      cardWrap.addEventListener('pointerdown', (ev)=>{
        if(ev.button !== 0) return;
        if(ev.target && ev.target.closest && ev.target.closest('button')) return;
        ev.preventDefault();
        startDragFromHand(i, cardWrap);
      });

      const replaceBtn = el('button',{class:'btn slot-action'},['Replace']);
      if(ctx.encounter.ap < 1) replaceBtn.setAttribute('disabled','');
      replaceBtn.addEventListener('click',()=>{
        // do not remove card from hand until replacement confirmed
        const card = ctx.encounter.deck.hand[i];
        if(!card) { if(ctx.setMessage) ctx.setMessage('Card not available'); return; }
        try{ if(ctx._lastEnemyAttack) delete ctx._lastEnemyAttack; }catch(e){}
        ctx.pendingReplace = { handIndex: i, mode: 'replace' };
        if(ctx.setMessage) ctx.setMessage('Click a space to replace it with '+(card.name||card.id));
        ctx.onStateChange();
      });
      actions.appendChild(replaceBtn);

      cardWrap.appendChild(actions);
      handGrid.appendChild(cardWrap);
    });
  handWrap.appendChild(handGrid);
  panel.appendChild(handWrap);

  // Enforce fixed hand-card sizes inline as a fallback in case CSS rules
  // from elsewhere still resize the hand when the window changes.
  try{
    document.querySelectorAll('.battle-panel .hand-wrap .card-wrap, .battle-panel .hand-wrap .card').forEach(el=>{
      el.style.width = '198px';
      el.style.minWidth = '198px';
      el.style.maxWidth = '198px';
      // Increase hand card height for better readability and spacing
      el.style.height = '360px';
      el.style.minHeight = '360px';
      el.style.maxHeight = '360px';
      el.style.flex = '0 0 auto';
      el.style.boxSizing = 'border-box';
      el.style.transition = 'none';
    });
  }catch(e){ /* defensive: ignore if DOM unavailable */ }

  const endTurn = el('button',{class:'btn end-turn-btn'},['End Turn']);
  endTurn.addEventListener('click',()=>{ ctx.endTurn(); ctx.onStateChange(); });
  // place End Turn button under the enemy area (right column)
  enemyArea.appendChild(endTurn);
  // append summons area last so it appears below everything else on screen
  panel.appendChild(createSummons());

  // Spacebar -> End Turn (only while this battle panel is connected)
  (function setupSpacebar(){
    const handler = (e) => {
      if(!panel.isConnected){ window.removeEventListener('keydown', handler); return; }
      const isSpace = e.code === 'Space' || e.key === ' ';
      if(!isSpace) return;
      const ae = document.activeElement;
      if(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      e.preventDefault();
      if(ctx.pendingSummon || ctx.pendingAction || ctx.pendingReplace){ if(ctx.setMessage) ctx.setMessage('Finish pending action first'); return; }
      if(typeof ctx.endTurn === 'function'){
        ctx.endTurn();
        if(typeof ctx.onStateChange === 'function') ctx.onStateChange();
      }
    };
    window.addEventListener('keydown', handler);
  })();
}
