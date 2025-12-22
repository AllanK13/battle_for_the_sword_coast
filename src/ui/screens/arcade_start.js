import { el, cardTile } from '../renderer.js';
import { navigate } from '../router.js';
import { AudioManager } from '../../engine/audio.js';

export function renderStart(root, ctx){
  // wrapper to scope start-screen styles
  const container = el('div',{class:'start-screen'},[]);
  // centered title logo image (title header removed per request)
  const titleText = (ctx && ctx.meta && ctx.meta.gameName) ? ctx.meta.gameName : 'Battle for the Sword Coast';
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
    const statsBtn = el('button',{class:'btn stats-btn floating icon', style:'position:fixed;right:90px;bottom:36px;z-index:10030;height:40px;display:flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:6px;font-size:16px', title:'Stats'},[ el('span',{style:'font-size:22px;line-height:1;display:inline-block'},['📊']) ]);
    statsBtn.addEventListener('click', ()=>{ if(ctx.onShowStats) ctx.onShowStats(); });
    container.appendChild(statsBtn);

    // How to Play button (next to stats button)
    const howtoBtn = el('button',{class:'btn howto-btn floating icon', style:'position:fixed;left:18px;bottom:36px;z-index:10030;height:40px;display:flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:6px;font-size:16px', title:'How to Play'},[ el('span',{style:'font-size:22px;line-height:1;display:inline-block'},['❓']) ]);
    howtoBtn.addEventListener('click', ()=>{ if(ctx.onShowHowTo) ctx.onShowHowTo(); });
    container.appendChild(howtoBtn);

  // Menu button (top-left) to return to the menu screen
  try{
    const menuBtn = el('button',{class:'btn menu-top-btn floating icon', style:'position:fixed;left:18px;top:18px;z-index:10030;height:40px;display:flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:6px;font-size:16px', title:'Menu'},[ el('span',{style:'font-size:20px;line-height:1;display:inline-block'},['🏠']) ]);
    menuBtn.addEventListener('click', ()=>{ if(ctx && typeof ctx.onShowMenu === 'function') ctx.onShowMenu(); else navigate('menu'); });
    container.appendChild(menuBtn);
  }catch(e){ /* ignore */ }

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
    // Debug: quick-start an encounter by enemy
    try{
      const enemyLabel = el('div',{style:'margin-top:8px;font-weight:700'},['Start specific enemy:']);
      const enemySelect = el('select',{style:'display:block;margin-top:6px;width:100%'},[]);
      (ctx.data && Array.isArray(ctx.data.enemies) ? ctx.data.enemies : []).forEach((e,i)=>{
        const opt = el('option',{value:String(i)},[ (e.name || e.id || String(i)) ]);
        enemySelect.appendChild(opt);
      });
      const startEnemyBtn = el('button',{class:'btn'},['Start Enemy']);
      startEnemyBtn.style.display = 'block';
      startEnemyBtn.style.marginTop = '8px';
      startEnemyBtn.addEventListener('click',()=>{
        const val = enemySelect.value;
        if(typeof ctx.onDebugStartEnemy === 'function') ctx.onDebugStartEnemy(Number(val));
        else if(ctx.setMessage) ctx.setMessage('No debug start handler available');
      });
      debugPanel.appendChild(enemyLabel);
      debugPanel.appendChild(enemySelect);
      debugPanel.appendChild(startEnemyBtn);
    }catch(e){ /* ignore */ }
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
  let slots = (ctx.meta && ctx.meta.partySlots) ? ctx.meta.partySlots : 3;
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
  // Controls: filter by name, sort by field, and show only cards that fit party slots
  const controls = el('div',{class:'start-controls', style:'display:flex;gap:8px;margin:8px 0;align-items:center;'},[]);
  // Build custom dropdowns (replace native selects so expanded list can be transparent)
  function buildCustomSelect(items, initialValue){
    let value = initialValue;
    const wrapper = el('div',{class:'custom-select'},[]);
    const btn = el('button',{class:'custom-select-button', type:'button'},[ items.find(i=>i.value===initialValue)?.label || items[0].label ]);
    const menu = el('div',{class:'custom-select-menu'},[]);
    items.forEach(it=>{
      const item = el('div',{class:'custom-select-item','data-value':it.value, tabindex:0},[it.label]);
      item.addEventListener('click', ()=>{
        value = it.value;
        // update button label
        try{ btn.textContent = String(it.label); }catch(e){}
        wrapper.classList.remove('open');
        if(typeof wrapper._onchange === 'function') wrapper._onchange(value);
      });
      item.addEventListener('keydown',(ev)=>{ if(ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); item.click(); } });
      menu.appendChild(item);
    });
    btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); wrapper.classList.toggle('open'); });
    // close when clicking outside
    document.addEventListener('click', (ev)=>{ if(!wrapper.contains(ev.target)) wrapper.classList.remove('open'); });
    wrapper.appendChild(btn);
    wrapper.appendChild(menu);
    wrapper.getValue = ()=> value;
    wrapper.setValue = (v)=>{ const found = items.find(i=>i.value===v); if(found){ value = v; btn.textContent = found.label; } };
    wrapper.onchange = (fn)=>{ wrapper._onchange = fn; };
    return wrapper;
  }

  const filterItems = [
    {value:'all', label:'Slots: All'},
    {value:'1', label:'Slots: 1'},
    {value:'2', label:'Slots: 2'},
    {value:'3', label:'Slots: 3'},
    {value:'4', label:'Slots: 4'},
    {value:'5', label:'Slots: 5'}
  ];
  const sortItems = [
    {value:'slot_cost:asc', label:'Sort: Slot Cost (asc)'},
    {value:'slot_cost:desc', label:'Sort: Slot Cost (desc)'},
    {value:'name:asc', label:'Sort: Name (asc)'},
    {value:'name:desc', label:'Sort: Name (desc)'},
    {value:'hp:asc', label:'Sort: HP (asc)'},
    {value:'hp:desc', label:'Sort: HP (desc)'},
  ];
  const filterWidget = buildCustomSelect(filterItems, 'all');
  const sortWidget = buildCustomSelect(sortItems, 'name:asc');
  filterWidget.onchange(()=> renderCards());
  sortWidget.onchange(()=> renderCards());
  controls.appendChild(filterWidget);
  controls.appendChild(sortWidget);
  container.insertBefore(controls, cardBox);
  const selected = new Set();
  const cardsById = {};
  function getUsedSlots(){
    let sum = 0;
    selected.forEach(id => {
      const card = cardsById[id];
      const cost = (card && typeof card.slot_cost !== 'undefined') ? Number(card.slot_cost) : 1;
      if(!isNaN(cost)) sum += cost;
    });
    return sum;
  }
  function updateSlotDisplay(){
    const used = getUsedSlots();
    const remaining = Math.max(0, slots - used);
    remainingBadge.textContent = String(remaining);
    selectedBadge.textContent = String(used);
    // enable/disable the start button based on selection
    try{ if(typeof startBtn !== 'undefined') startBtn.disabled = (used === 0); }catch(e){}
  }
  // render selectable cards: starters and any recruited/owned characters
  const ownedIds = (ctx.meta && Array.isArray(ctx.meta.ownedCards)) ? ctx.meta.ownedCards : [];
  // include both regular cards and any legendary items that are full hero cards (have `hp`)
  const poolCards = [];
  (ctx.data.cards||[]).forEach(c=> poolCards.push(c));
  (ctx.data.legendary||[]).forEach(l=>{ if(l && typeof l.hp === 'number') poolCards.push(l); });
  // renderCards: applies filters/sorting then renders tiles into cardBox
  function renderCards(){
    // clear grid
    cardBox.innerHTML = '';
    const filterMode = (typeof filterWidget !== 'undefined' ? filterWidget.getValue() : 'all') || 'all';
    const sortRaw = (typeof sortWidget !== 'undefined' ? sortWidget.getValue() : 'name:asc') || 'name:asc';
    const parts = String(sortRaw).split(':');
    const sortKey = parts[0] || 'name';
    const sortDir = (parts[1] || 'asc').toLowerCase();
    const fitOnly = false;
    let visible = poolCards.filter(c => c && (c.starter || ownedIds.includes(c.id)));
    // apply dropdown filter by slot cost (match exactly the selected number)
    if(filterMode && filterMode !== 'all'){
      const targetSlots = Number(filterMode) || 0;
      visible = visible.filter(c => {
        const cost = (c && typeof c.slot_cost !== 'undefined') ? Number(c.slot_cost) : 1;
        return !isNaN(cost) && cost === targetSlots;
      });
    }
    // apply fit-only filter
    const filtered = visible.filter(c => {
      if(!c) return false;
      if(fitOnly){ const cost = (c && typeof c.slot_cost !== 'undefined') ? Number(c.slot_cost) : 1; if(isNaN(cost) || cost > slots) return false; }
      return true;
    });
    // sort
    filtered.sort((a,b)=>{
      if(sortKey === 'name'){
        const cmp = String((a.name||'')).localeCompare(String((b.name||'')));
        return sortDir === 'desc' ? -cmp : cmp;
      }
      if(sortKey === 'hp'){
        const diff = (Number(a.hp)||0) - (Number(b.hp)||0);
        return sortDir === 'desc' ? -diff : diff;
      }
      if(sortKey === 'slot_cost'){
        const diff = (Number(a.slot_cost)||1) - (Number(b.slot_cost)||1);
        return sortDir === 'desc' ? -diff : diff;
      }
      return 0;
    });
    // render
    filtered.forEach(c=>{
      cardsById[c.id] = c;
      const opts = { hideCost: true, slotFirst: true };
      try{
        if(c && c.id === 'griff'){
          if(!ctx.meta) ctx.meta = {};
          let v = ctx.meta.griffVariant;
          try{ if(!v && typeof localStorage !== 'undefined'){ const ls = localStorage.getItem('griffVariant'); if(ls) v = Number(ls); } }catch(e){}
          if(!v){ v = Math.floor(Math.random()*7)+1; ctx.meta.griffVariant = v; try{ if(typeof localStorage !== 'undefined') localStorage.setItem('griffVariant', String(v)); }catch(e){} }
          opts.imageOverride = './assets/griff' + v + '.png';
        }
      }catch(e){}
      const tile = cardTile(c, opts);
      tile.style.cursor='pointer';
      if(selected.has(c.id)) tile.classList.add('selected');
      tile.addEventListener('click',()=>{
        if(selected.has(c.id)){
          selected.delete(c.id);
          tile.classList.remove('selected');
          updateSlotDisplay();
          return;
        }
        const used = getUsedSlots();
        const cost = (typeof c.slot_cost !== 'undefined') ? Number(c.slot_cost) : 1;
        if(isNaN(cost) || cost < 0){ if(ctx.setMessage) ctx.setMessage('Invalid slot cost for card'); return; }
        if(used + cost > slots){ if(ctx.setMessage) ctx.setMessage('Not enough party slots for '+c.name); return; }
        selected.add(c.id);
        tile.classList.add('selected');
        updateSlotDisplay();
      });
      cardBox.appendChild(tile);
    });
  }
  // wire controls (custom widgets already call `renderCards` on change)
  // Note: 'Fits party slots' filter removed; renderCards will not filter by fit-only.
  // initial render
  renderCards();

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
