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
  const opts = { currentHp: slotObj.hp, tempHp: slotObj.tempHp, hideSlot: true, hideCost: true };
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
  const tile = cardTile(slotObj.base, opts);
  container.appendChild(tile);
  // show a defend/shield badge when this hero is defending
  if(slotObj.defending){
    // ensure the container can host an absolute badge
    container.style.position = 'relative';
    const badge = el('div',{class:'defend-badge'},['💨']);
    container.appendChild(badge);
  }
  if(slotObj.helped){
    container.style.position = 'relative';
    const helpBadge = el('div',{class:'help-badge'},['🕷️']);
    container.appendChild(helpBadge);
  }
  const btns = el('div',{class:'row'});
  // when a hero is in the slot, show the generic Action (could be attack/heal/etc.)
  const act = el('button',{class:'btn slot-action'},['Action']);
  if(handlers.ap !== undefined && handlers.ap < 1) act.setAttribute('disabled','');
  act.addEventListener('click',(e)=>{ e.stopPropagation(); if(handlers.onAction) handlers.onAction(idx); });
  btns.appendChild(act);
  // also provide a Dodge button for placed characters
  const defend = el('button',{class:'btn slot-action dodge-btn'},['Dodge']);
  if(handlers.ap !== undefined && handlers.ap < 1) defend.setAttribute('disabled','');
  defend.addEventListener('click',(e)=>{ e.stopPropagation(); if(handlers.onDefend) handlers.onDefend(idx); });
  btns.appendChild(defend);
  container.appendChild(btns);
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
    // disable button to avoid re-entrancy
    try{ endRunBtn.setAttribute('disabled',''); }catch(e){}
    // defensively clear per-run usage and persist
    try{ if(ctx && ctx.meta) { ctx.meta.summonUsage = {}; saveMeta(ctx.meta); } }catch(e){ console.debug('GiveUp: saveMeta failed', e); }
    // attempt immediate navigation, then fall back to forced page load if that fails
    try{
      try{ navigate('arcade_start'); console.debug('GiveUp: navigate(arcade_start) invoked'); }
      catch(e){ console.debug('GiveUp: navigate threw', e); }
      // schedule forced navigation fallbacks in case route navigation doesn't take effect
      setTimeout(()=>{
        try{ window.location.assign(window.location.pathname || '/'); console.debug('GiveUp: forced assign to pathname'); }
        catch(e){ console.debug('GiveUp: forced assign failed', e); }
      }, 100);
      setTimeout(()=>{
        try{ window.location.reload(); console.debug('GiveUp: forced reload'); }
        catch(e){ console.debug('GiveUp: reload failed', e); }
      }, 500);
    }catch(e){ console.debug('GiveUp: unexpected error', e); }
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

  // responsive scaling: compute a scale factor and set CSS variable `--ui-scale` on :root
  (function setupScale(){
    if(ctx._scaleSetup) return;
    // Throttle updates and only apply when change is noticeable to avoid
    // rapid tiny adjustments while scrolling on mobile which causes jitter.
    let rafId = null;
    let lastScale = null;
    const applyScale = (s)=>{
      lastScale = s;
      document.documentElement.style.setProperty('--ui-scale', String(s));
    };

    const computeAndMaybeApply = ()=>{
      // remove listener when panel is no longer in the DOM
      if(!panel.isConnected){ window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule); window.removeEventListener('orientationchange', schedule); return; }
      try{
        const container = root;
        const panelRect = panel.getBoundingClientRect();
        const pw = panelRect.width || panel.offsetWidth || 1100;
        const ph = panelRect.height || panel.offsetHeight || 800;
        const cw = container.clientWidth || window.innerWidth;
        const ch = container.clientHeight || window.innerHeight;
        let scale = Math.min(cw / pw, ch / ph, 1);
        if(!isFinite(scale) || scale <= 0) scale = 1;
        // avoid becoming too tiny; clamp to a sensible minimum
        scale = Math.max(0.5, scale);
        // only apply if change is larger than threshold to prevent jitter
        if(lastScale === null || Math.abs(scale - lastScale) > 0.03){
          applyScale(scale);
        }
      }catch(e){ /* ignore measurement errors */ }
    };

    const schedule = ()=>{
      if(rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(()=>{ rafId = null; computeAndMaybeApply(); });
    };

    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive:true });
    window.addEventListener('orientationchange', schedule);
    // run after layout so measurements are meaningful
    setTimeout(schedule, 0);
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
      try{ if(s && s.id === 'blackrazor') sOpts.imageOverride = './assets/Blackrazor.png'; }catch(e){}
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
      enemyOpts.imageOverride = './assets/Acererak.png';
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
      onAction(idx){
        if(ctx.encounter.ap < 1) { if(ctx.setMessage) ctx.setMessage('Not enough AP'); return; }
        // detect explicit actionType if present
        const hero = ctx.encounter.playfield[idx];
        const primary = (hero && hero.base) ? ((Array.isArray(hero.base.abilities) && hero.base.abilities.length>0) ? (hero.base.abilities.find(a=>a.primary) || hero.base.abilities[0]) : null) : null;
        const actionType = (primary && primary.actionType) ? primary.actionType : (hero && hero.base && hero.base.actionType) ? hero.base.actionType : null;
        if(actionType === 'support'){
          // Willis requires selecting a target to protect
          if(hero && hero.base && hero.base.id === 'willis'){
            ctx.pendingAction = { type: 'willis', from: idx };
            if(ctx.setMessage) ctx.setMessage('Click a space to select a target to protect');
            ctx.onStateChange();
            return;
          }
          // immediate apply support (e.g., Piter's Help or Shalendra)
          const res = ctx.playHeroAction(idx);
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
          ctx.pendingAction = { type:'heal', from: idx };
          if(ctx.setMessage) ctx.setMessage('Click a space to heal');
          ctx.onStateChange();
          return;
        }
        ctx.playHeroAction(idx);
        ctx.onStateChange();
      },
      highlight,
      isTarget,
      ctx,
      onDefend(idx){
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
        // if summon pending, apply summon to this target
        if(pendingSummon){
          const res = ctx.useSummon(pendingSummon.id, idx);
          ctx.pendingSummon = null;
          ctx.onStateChange();
          return;
        }
        // if an action is pending (e.g., a heal), apply it to this target
        if(ctx.pendingAction && ctx.pendingAction.type === 'heal'){
          const from = ctx.pendingAction.from;
          const res = ctx.playHeroAction(from, idx);
          if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
          ctx.pendingAction = null;
          ctx.onStateChange();
          return;
        }
        // Willis protection target selection
        if(ctx.pendingAction && ctx.pendingAction.type === 'willis'){
          const from = ctx.pendingAction.from;
          const res = ctx.playHeroAction(from, idx);
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
          const res = ctx.playHeroAction(from, idx);
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
        if(hasLum){
          container.style.position = container.style.position || 'relative';
          const lumBadge = el('div',{class:'lumalia-badge', title: 'Lumalia: delayed effect'},['🕓']);
          container.appendChild(lumBadge);
        }
      }
    }catch(e){}

    // Show Willis protection badge when a hero is currently protected
    try{
      const hero = ctx && ctx.encounter && ctx.encounter.playfield ? ctx.encounter.playfield[i] : null;
      if(hero && hero.protected && hero.protected.source === 'willis'){
        container.style.position = container.style.position || 'relative';
        const wBadge = el('div',{class:'willis-badge', title: 'Protected (Willis)'},['🌪']);
        container.appendChild(wBadge);
      }
    }catch(e){}

    // Disable Action button for heroes whose support was already used this round
    try{
      const hero = ctx && ctx.encounter && ctx.encounter.playfield ? ctx.encounter.playfield[i] : null;
      const actionBtn = container.querySelector && container.querySelector('.slot-action');
      if(actionBtn && hero && hero.base && hero.base.id && ctx.encounter && ctx.encounter.supportUsed && ctx.encounter.supportUsed[hero.base.id]){
        actionBtn.setAttribute('disabled','');
      }
    }catch(e){}

    return container;
  }

  // place slot 3 (index 2) on the left, and slots 1 & 2 (indices 0 & 1) stacked to the right
  const backSlotWrap = el('div',{class:'playfield-back'},[]);
  backSlotWrap.appendChild(makeSlot(2));

  const frontCol = el('div',{class:'playfield-front'},[]);
  frontCol.appendChild(makeSlot(0));
  frontCol.appendChild(makeSlot(1));

  // append back (left) then front (right) so slots 1/2 are visually to the right of slot 3
  playfield.appendChild(backSlotWrap);
  playfield.appendChild(frontCol);
  // append playfield (labeled 'Grid') left, enemy on the right inside a top row
  const topRow = el('div',{class:'battle-top'},[]);
  const leftCol = el('div',{},[]);
  leftCol.appendChild(el('h3',{class:'slot-header'},['Party Formation']));
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
      ctx.pendingReplace = { handIndex, mode: 'place' };
      if(ctx.setMessage) ctx.setMessage('Drag the card to an empty space to place it');
      ctx.onStateChange && ctx.onStateChange();

      const origCardEl = cardWrap.querySelector && cardWrap.querySelector('.card');
      const clone = origCardEl ? origCardEl.cloneNode(true) : document.createElement('div');
      clone.style.position = 'fixed';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '10050';
      try{ clone.style.width = (origCardEl ? origCardEl.getBoundingClientRect().width : 120) + 'px'; }catch(e){}
      clone.classList.add('dragging-card');
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
