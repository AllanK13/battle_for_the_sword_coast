import { el, cardTile } from '../renderer.js';
import { navigate } from '../router.js';
import { AudioManager } from '../../engine/audio.js';

function slotNode(slotObj, idx, handlers={}, highlight=false, targetHighlight=false){
  const container = el('div',{class:'card-wrap panel'});
  if(highlight) container.classList.add('pending-slot');
  if(targetHighlight) container.classList.add('pending-target');
  if(!slotObj){
    // mark this wrapper as an empty slot so CSS can size/center the placeholder
    container.classList.add('empty-slot');
    const empty = el('div',{class:'muted empty-label'},['Space '+(idx+1)]);
    container.appendChild(empty);
    container.addEventListener('click',()=>{ if(handlers.onClick) handlers.onClick(idx); });
    return container;
  }
  // hero image tile (show current HP in the card stats)
  const tile = cardTile(slotObj.base, { currentHp: slotObj.hp, hideSlot: true, hideCost: true });
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
  container.addEventListener('click',()=>{ if(handlers.onClick) handlers.onClick(idx); });
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
        if(enemy.id === 'twig_blight' || (enemy.name && /twig/i.test(enemy.name))){
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
    if(ok){ navigate('start'); }
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
    const availableSummons = (ctx.data.summons || []).filter(s => ownedSummons.includes(s.id));
    if(availableSummons.length === 0){
      sGrid.appendChild(el('div',{class:'muted'},['No summons available']));
    }
    availableSummons.forEach(s=>{
      // build the summon card (cardTile returns a `.card` element)
      const sCard = cardTile(s, { hideSlot: true, hideCost: true });
      const used = ctx.encounter.summonUsed && ctx.encounter.summonUsed[s.id];
      const cd = ctx.encounter.summonCooldowns && (ctx.encounter.summonCooldowns[s.id]||0);
      const btn = el('button',{class:'btn'},[ used ? 'Used' : (cd>0 ? 'Cooldown: '+cd : 'Cast')]);
      if(used || cd>0) btn.setAttribute('disabled','');
      btn.addEventListener('click',()=>{
        const needsTarget = /one target|target/i.test(s.ability||'') || s.id === 'blackrazor';
        if(needsTarget){
            ctx.pendingSummon = { id: s.id, name: s.name };
            if(ctx.setMessage) ctx.setMessage('Click a space to target '+s.name);
            ctx.onStateChange();
            return;
          }
        const res = ctx.useSummon(s.id);
        if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
        else { if(ctx.setMessage) ctx.setMessage('Summon cast: '+s.name); ctx.onStateChange(); }
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
  const enemyCard = cardTile(ctx.encounter.enemy, { hideSlot: true, hideHp: true });
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
  enemyArea.appendChild(enemyCard);

  // Playfield display (3 slots) — front column: slots 1 & 2 stacked; back slot (behind): slot 3
  const playfield = el('div',{class:'panel playfield'},[]);
  // pendingReplace / pendingSummon persisted on ctx so they survive re-renders
  const pendingReplace = ctx.pendingReplace || null;
  const pendingSummon = ctx.pendingSummon || null;
  const pendingAction = ctx.pendingAction || null;
  const pendingAny = pendingReplace || pendingSummon || pendingAction || null;

  function makeSlot(i){
    const isTarget = Boolean(ctx.pendingAction && ctx.pendingAction.type === 'heal' && ctx.encounter.playfield[i]);
    return slotNode(ctx.encounter.playfield[i], i, {
      ap: ctx.encounter.ap,
      onAction(idx){
        if(ctx.encounter.ap < 1) { if(ctx.setMessage) ctx.setMessage('Not enough AP'); return; }
        // detect explicit actionType if present
        const hero = ctx.encounter.playfield[idx];
        const actionType = (hero && hero.base && hero.base.actionType) ? hero.base.actionType : null;
        if(actionType === 'support'){
          // immediate apply support (e.g., Piter's Help or Shalendra)
          const res = ctx.playHeroAction(idx);
          if(!res.success){ if(ctx.setMessage) ctx.setMessage(res.reason||'Action failed'); }
          ctx.onStateChange();
          return;
        }
        // determine if this hero's action requires a target (common for single-target heals)
        const ability = (hero && hero.base && hero.base.ability) ? hero.base.ability.toLowerCase() : '';
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
          if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
          else { if(ctx.setMessage) ctx.setMessage('Summon applied'); }
          ctx.pendingSummon = null;
          ctx.onStateChange();
          return;
        }
        // if an action is pending (e.g., a heal), apply it to this target
        if(ctx.pendingAction && ctx.pendingAction.type === 'heal'){
          const from = ctx.pendingAction.from;
          const res = ctx.playHeroAction(from, idx);
          if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
          else { if(ctx.setMessage) ctx.setMessage('Healed space '+(res.slot+1)+' for '+res.healed+' HP'); }
          ctx.pendingAction = null;
          ctx.onStateChange();
          return;
        }
        if(!pendingReplace) return;
        if(ctx.encounter.ap < 1) { if(ctx.setMessage) ctx.setMessage('Not enough AP to replace'); ctx.pendingReplace = null; ctx.onStateChange(); return; }
        const card = pendingReplace.card;
        const res = ctx.replaceHero(idx, card);
        if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
        ctx.pendingReplace = null;
        ctx.onStateChange();
      },
      onClick(idx){
        // clicking a slot same behavior as onSelect for pending actions
        if(pendingSummon){
          const res = ctx.useSummon(pendingSummon.id, idx);
          if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
          else { if(ctx.setMessage) ctx.setMessage('Summon applied'); }
          ctx.pendingSummon = null;
          ctx.onStateChange();
          return;
        }
        // handle pendingAction (heal) on click
        if(ctx.pendingAction && ctx.pendingAction.type === 'heal'){
          const from = ctx.pendingAction.from;
          const res = ctx.playHeroAction(from, idx);
          if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
          else { if(ctx.setMessage) ctx.setMessage('Healed space '+(res.slot+1)+' for '+res.healed+' HP'); }
          ctx.pendingAction = null;
          ctx.onStateChange();
          return;
        }
        if(!pendingReplace) return;
        if(ctx.encounter.ap < 1) { if(ctx.setMessage) ctx.setMessage('Not enough AP to replace'); ctx.pendingReplace = null; ctx.onStateChange(); return; }
        const card = pendingReplace.card;
        const res = ctx.replaceHero(idx, card);
        if(!res.success) { if(ctx.setMessage) ctx.setMessage(res.reason||'failed'); }
        ctx.pendingReplace = null;
        ctx.onStateChange();
      }
    }, Boolean(pendingAny), isTarget);
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
  handWrap.appendChild(el('h3',{class:'hand-title'},['Hand']));
  const handGrid = el('div',{class:'card-grid'},[]);
    ctx.encounter.deck.hand.forEach((c,i)=>{
      const cardWrap = el('div',{class:'card-wrap panel'});
      cardWrap.appendChild(cardTile(c, { hideCost: true, hideSlot: true }));

      const actions = el('div',{class:'row'},[]);
      const placeBtn = el('button',{class:'btn slot-action'},['Place (first unoccupied space)']);
      placeBtn.addEventListener('click',()=>{
        const card = ctx.encounter.deck.playFromHand(i);
        const res = ctx.placeHero(card);
        if(!res.success) { if(ctx.setMessage) ctx.setMessage('No unoccupied space'); }
        ctx.onStateChange();
      });
      actions.appendChild(placeBtn);

      const replaceBtn = el('button',{class:'btn slot-action'},['Replace']);
      if(ctx.encounter.ap < 1) replaceBtn.setAttribute('disabled','');
      replaceBtn.addEventListener('click',()=>{
        const card = ctx.encounter.deck.playFromHand(i);
        ctx.pendingReplace = { card, handIndex: i };
        if(ctx.setMessage) ctx.setMessage('Click a space to replace it with '+card.name);
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
