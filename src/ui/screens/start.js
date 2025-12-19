import { el, cardTile } from '../renderer.js';
import { AudioManager } from '../../engine/audio.js';

export function renderStart(root, ctx){
  // wrapper to scope start-screen styles
  const container = el('div',{class:'start-screen'},[]);
  // show game title and centered title logo image
  const titleText = (ctx && ctx.meta && ctx.meta.gameName) ? ctx.meta.gameName : 'Battle for the Sword Coast';
  const titleEl = el('h1',{class:'game-title'},[titleText]);
  container.appendChild(titleEl);
  const logo = el('img',{src:'assets/title_logo.png', alt:titleText, class:'title-logo'});
  logo.addEventListener('error', ()=>{ logo.src='assets/title_logo.jpg'; });
  logo.addEventListener('error', ()=>{ logo.style.display='none'; });
  container.appendChild(logo);

  // Upgrades button shown centered below the title/logo (hidden until player earns IP)
  if(ctx.meta && (ctx.meta.totalIpEarned||0) > 0){
    const upgradesBtn = el('button',{class:'btn upgrades-btn', style:'display:block;margin:8px auto 16px auto'},[
      el('span',{class:'btn-icon-left'},['🏘️']),
      el('span',{class:'btn-label'},[' Visit Daggerford'])
    ]);
    upgradesBtn.addEventListener('click', ()=>{ if(ctx.onShowUpgrades) ctx.onShowUpgrades(); });
    container.appendChild(upgradesBtn);
  }

  // Add a fixed-position Stats button that only appears on the start/menu screen
    const statsBtn = el('button',{class:'btn stats-btn floating icon', style:'position:fixed;right:92px;bottom:36px;z-index:10030;height:40px;display:flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:6px;font-size:16px', title:'Stats'},[ el('span',{style:'font-size:22px;line-height:1;display:inline-block'},['📊']) ]);
  statsBtn.addEventListener('click', ()=>{ if(ctx.onShowStats) ctx.onShowStats(); });
  container.appendChild(statsBtn);

  // Floating music control placed next to the stats button (bottom-right)
  try{
    const musicBtn = el('button',{class:'btn music-btn floating icon', style:'position:fixed;right:18px;bottom:36px;z-index:10030;height:40px;display:flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:6px;background:linear-gradient(180deg,#10b981,#047857);color:#fff;border:1px solid rgba(0,0,0,0.12);font-size:22px', title:'Music'},[ el('span',{style:'font-size:22px;line-height:1;display:inline-block'},[ AudioManager.isEnabled() ? '🔊' : '🔈' ]) ]);
    const musicPanel = el('div',{class:'panel music-panel', style:'position:fixed;right:18px;bottom:76px;z-index:10030;display:none;padding:8px;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.25)'},[]);
    const volLabel = el('div',{},['Volume']);
    const volInput = el('input',{type:'range', min:0, max:100, value: String(Math.round((AudioManager.getVolume ? AudioManager.getVolume() : 0.6) * 100)), style:'width:160px;display:block'});
    volInput.addEventListener('input', (ev)=>{ const v = Number(ev.target.value || 0) / 100; AudioManager.setVolume(v); });
    // Keep controls in sync with AudioManager state
    function syncControls(){
      try{
        const span = musicBtn.querySelector('span');
        if(span) span.textContent = AudioManager.isEnabled() ? '🔊' : '🔈';
        const v = Math.round((AudioManager.getVolume ? AudioManager.getVolume() : 0.6) * 100);
        volInput.value = String(v);
      }catch(e){ /* ignore */ }
    }
    musicPanel.appendChild(volLabel);
    musicPanel.appendChild(volInput);

    let panelTimer = null;
    function showPanel(){
      syncControls();
      musicPanel.style.display = 'block';
      if(panelTimer) clearTimeout(panelTimer);
      panelTimer = setTimeout(()=>{ musicPanel.style.display = 'none'; panelTimer = null; }, 4000);
    }

    musicBtn.addEventListener('click', ()=>{
      const on = AudioManager.toggle();
      // update inner span
      const span = musicBtn.querySelector('span'); if(span) span.textContent = on ? '🔊' : '🔈';
      syncControls();
      showPanel();
    });

    musicBtn.addEventListener('mouseover', showPanel);
    musicPanel.addEventListener('mouseover', ()=>{ if(panelTimer) clearTimeout(panelTimer); });
    musicPanel.addEventListener('mouseleave', ()=>{ if(panelTimer) clearTimeout(panelTimer); panelTimer = setTimeout(()=>{ musicPanel.style.display='none'; panelTimer=null; }, 1000); });

    container.appendChild(musicBtn);
    container.appendChild(musicPanel);
  }catch(e){ /* ignore if AudioManager unavailable */ }

  // Debug UI (disabled by default). Enable by setting `ctx.meta.debugEnabled = true`.
  if(ctx.meta && ctx.meta.debugEnabled){
    const debugBtn = el('button',{class:'btn debug-btn floating icon', style:'position:fixed;left:18px;bottom:18px;z-index:10030', title:'Debug'},['🐞']);
    let debugOpen = false;
    const debugPanel = el('div',{class:'panel debug-panel', style:'position:fixed;left:18px;bottom:64px;z-index:10030;display:none;padding:8px;'},[]);
    const grantBtn = el('button',{class:'btn'},['Grant 10000 IP']);
    grantBtn.addEventListener('click',()=>{ if(ctx.onDebugGrant) ctx.onDebugGrant(); else if(ctx.setMessage) ctx.setMessage('No debug handler'); });
    const unlockBtn = el('button',{class:'btn'},['Unlock All Characters & Summons']);
    unlockBtn.style.display = 'block';
    unlockBtn.style.marginTop = '8px';
    unlockBtn.addEventListener('click',()=>{ if(ctx.onDebugUnlock) ctx.onDebugUnlock(); else if(ctx.setMessage) ctx.setMessage('No debug handler'); });
    debugPanel.appendChild(grantBtn);
    debugPanel.appendChild(unlockBtn);
    const unlockTownBtn = el('button',{class:'btn'},['Unlock Town (grant access to Daggerford)']);
    unlockTownBtn.style.display = 'block';
    unlockTownBtn.style.marginTop = '8px';
    unlockTownBtn.addEventListener('click',()=>{ if(ctx.onDebugUnlockTown) ctx.onDebugUnlockTown(); else if(ctx.setMessage) ctx.setMessage('No debug handler'); });
    debugPanel.appendChild(unlockTownBtn);
    debugBtn.addEventListener('click',()=>{ debugOpen = !debugOpen; debugPanel.style.display = debugOpen ? 'block' : 'none'; });
    container.appendChild(debugBtn);
    container.appendChild(debugPanel);
  }

  const info = el('div',{class:'hud'},[]);
  const ipAmount = (ctx && ctx.meta && typeof ctx.meta.ip !== 'undefined') ? ctx.meta.ip : 0;
  const ipDisplay = el('div',{class:'ip-display'},[]);
  ipDisplay.appendChild(el('div',{class:'ip-label'},['Inspiration Points: ']));
  ipDisplay.appendChild(el('div',{class:'ip-badge'},[String(ipAmount)]));
  info.appendChild(ipDisplay);
  // (Music controls moved to a floating control near the stats button)
  const slots = (ctx.meta && ctx.meta.partySlots) ? ctx.meta.partySlots : 3;
  const slotDisplay = el('div',{class:'slot-badges'},[]);
  const label = el('div',{},['Party Slots: ']);
  const remainingBadge = el('div',{class:'badge remaining-badge'},[String(slots)]);
  const selLabel = el('div',{style:'margin:0 8px'},['Selected: ']);
  const selectedBadge = el('div',{class:'badge selected-badge'},['0']);
  slotDisplay.appendChild(label);
  slotDisplay.appendChild(remainingBadge);
  slotDisplay.appendChild(selLabel);
  slotDisplay.appendChild(selectedBadge);
  info.appendChild(slotDisplay);
  container.appendChild(info);

  const cardBox = el('div',{class:'card-grid panel'});
  container.appendChild(cardBox);
  const selected = new Set();
  function updateSlotDisplay(){
    const sel = selected.size;
    const remaining = Math.max(0, slots - sel);
    remainingBadge.textContent = String(remaining);
    selectedBadge.textContent = String(sel);
    // enable/disable the start button based on selection
    try{ if(typeof startBtn !== 'undefined') startBtn.disabled = (sel === 0); }catch(e){}
  }
  // render selectable cards: starters and any recruited/owned characters
  const ownedIds = (ctx.meta && Array.isArray(ctx.meta.ownedCards)) ? ctx.meta.ownedCards : [];
  (ctx.data.cards||[]).filter(c => c && (c.starter || ownedIds.includes(c.id))).forEach(c=>{
    const tile = cardTile(c, { hideCost: true, slotFirst: true });
    tile.style.cursor='pointer';
    tile.addEventListener('click',()=>{
      if(selected.has(c.id)){
        selected.delete(c.id);
        tile.classList.remove('selected');
        updateSlotDisplay();
        return;
      }
      // prevent selecting more than available slots
      if(selected.size >= slots){
        if(ctx.setMessage) ctx.setMessage('Cannot select more than '+slots+' cards');
        return;
      }
      selected.add(c.id);
      tile.classList.add('selected');
      updateSlotDisplay();
    });
    cardBox.appendChild(tile);
  });

  const startBtn = el('button',{class:'btn start-run-btn'},['Venture Forth']);
  // disable start until at least one card selected
  startBtn.disabled = true;
  startBtn.addEventListener('click',()=>{
    if(selected.size === 0){
      if(ctx && typeof ctx.setMessage === 'function') ctx.setMessage('Select at least one card to start');
      else alert('Select at least one card to start');
      return;
    }
    // play a short flourish when the player starts the run
    try{
      const sfx = new Audio('./assets/music/boom.mp3');
      try{
        const userVol = (AudioManager && AudioManager.getVolume) ? (AudioManager.getVolume() || 1) : 1;
        const master = (AudioManager && typeof AudioManager.masterMultiplier === 'number') ? AudioManager.masterMultiplier : 1;
        // Play boom at 50% of the configured volume, then apply master multiplier
        sfx.volume = Math.max(0, Math.min(1, 0.8 * userVol * master));
      }catch(e){}
      const p = sfx.play(); if(p && p.catch) p.catch(()=>{});
    }catch(e){}
    const seed = undefined;
    const deckIds = Array.from(selected);
    ctx.onStartRun({seed, deckIds});
  });
  container.appendChild(startBtn);
  // initialize start button state
  try{ startBtn.disabled = true; }catch(e){}

  

  root.appendChild(container);
}
