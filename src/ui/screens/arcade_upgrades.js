import { el, cardTile } from '../renderer.js';
import { AudioManager } from '../../engine/audio.js';

function section(title){ return el('div',{class:'upg-section'},[el('h2',{class:'section-title'},[title])]); }

function tierName(n){ return n===1? 'Tier 1: Common' : n===2? 'Tier 2: Uncommon' : n===3? 'Tier 3: Rare' : 'Tier 4: Very Rare'; }

export function renderUpgrades(root, ctx){
  root.innerHTML = '';
  const wrapper = el('div',{class:'upgrades-screen', style:'position:relative;padding-top:48px'},[]);
  const container = el('div',{class:'upgrades-container'},[]);
  // Back button (top-right) styled like stats back
  const back = el('button',{class:'btn stats-back-btn', style:'position:absolute;right:12px;top:8px'},['Back']);
  back.addEventListener('click', ()=>{ if(ctx.onBack) ctx.onBack(); });
  wrapper.appendChild(back);
  container.appendChild(el('h1',{},['Daggerford']));
  container.appendChild(el('div',{class:'ip-display'},[
    'IP: ',
    el('span',{class:'ip-value'},[(ctx.meta && typeof ctx.meta.ip !== 'undefined' ? ctx.meta.ip : 0)])
  ]));

  // Recruit Heroes (by tier)
  const recruit = section('Recruit Heroes');
  [1,2,3,4].forEach(t=>{
    const tierWrap = el('div',{class:'tier-section tier-'+t},[]);
    tierWrap.appendChild(el('h3',{class:'section-title'},[tierName(t)]));
    const grid = el('div',{class:'card-grid'},[]);
    (ctx.data.cards||[]).filter(c=>Number(c.tier)===t).forEach(c=>{
      const cardWrap = el('div',{class:'card-wrap panel'},[]);
      const footer = el('div',{class:'row'},[]);
      const owned = (ctx.meta && Array.isArray(ctx.meta.ownedCards) && ctx.meta.ownedCards.includes(c.id));
      const cost = Number(c.ip_cost||0);
      const btn = el('button',{class:'btn'},[ owned? 'Recruited' : (cost>0? ('Recruit: '+cost+' IP') : 'Take') ]);
      if(owned) btn.setAttribute('disabled','');
      if(!owned && cost>0 && ctx.meta && ctx.meta.ip < cost) btn.setAttribute('disabled','');
      btn.addEventListener('click',()=>{ if(ctx.buyLegendary) ctx.buyLegendary(c.id); else if(ctx.setMessage) ctx.setMessage('No buy handler'); });
      footer.appendChild(btn);
      const opts = { hideSlot:false, hideCost:true, footer };
      cardWrap.appendChild(cardTile(c, opts));
      grid.appendChild(cardWrap);
    });
    tierWrap.appendChild(grid);
    recruit.appendChild(tierWrap);
  });
  container.appendChild(recruit);

  // Hire Summons
  const summonsSec = section('Hire Summons');
  const sGrid = el('div',{class:'card-grid summons-grid'},[]);
  (ctx.data.summons||[]).forEach(s=>{
    const owned = (ctx.meta && Array.isArray(ctx.meta.ownedSummons) && ctx.meta.ownedSummons.includes(s.id));
    const hasEarnedIp = ctx.meta && ((ctx.meta.totalIpEarned||0) > 0);
    // only show this summon in the shop if it's a starter, already owned, or the player has earned IP (Town unlocked)
    if(!owned && !s.starter && !hasEarnedIp) return;
    const wrap = el('div',{class:'card-wrap panel'},[]);
    const footer = el('div',{class:'row'},[]);
    const cost = Number(s.ip_cost||0);
    const btn = el('button',{class:'btn'},[ owned? 'Recruited' : ('Recruit: '+cost+' IP') ]);
    if(owned) btn.setAttribute('disabled','');
    if(!owned && ctx.meta && ctx.meta.ip < cost) btn.setAttribute('disabled','');
    btn.addEventListener('click',()=>{ if(ctx.buyLegendary) ctx.buyLegendary(s.id); else if(ctx.setMessage) ctx.setMessage('No buy handler'); });
    footer.appendChild(btn);
    const sOpts = { hideSlot:true, hideCost:true, footer };
    wrap.appendChild(cardTile(s, sOpts));
    sGrid.appendChild(wrap);
  });
  summonsSec.appendChild(sGrid);
  container.appendChild(summonsSec);

  // Metagame upgrades
  const metaSec = section('Metagame');
  const upGrid = el('div',{class:'card-grid meta-grid'},[]);
  (ctx.data.upgrades||[]).forEach(u=>{
    const item = el('div',{class:'panel card'},[]);
    item.appendChild(el('div',{class:'card-name'},[u.upgrade||u.id]));
    const purchased = ctx.meta && Array.isArray(ctx.meta.purchasedUpgrades) && ctx.meta.purchasedUpgrades.includes(u.id);
    // determine if this upgrade is locked behind another purchase
    let prereqLocked = false;
    let prereqMessage = '';
    const purchasedList = (ctx.meta && Array.isArray(ctx.meta.purchasedUpgrades)) ? ctx.meta.purchasedUpgrades : [];
    const slotMatch = /^slot_(\d+)$/.exec(u.id);
    if(slotMatch){
      const n = Number(slotMatch[1]);
      if(n > 1 && !purchasedList.includes('slot_'+(n-1))){ prereqLocked = true; prereqMessage = 'Requires previous slot'; }
    } else if(u.id === 'ap_5' && !purchasedList.includes('ap_4')){
      prereqLocked = true; prereqMessage = 'Requires AP to 4';
    } else if(u.id === 'slot_plus3' && !purchasedList.includes('slot_9')){
      prereqLocked = true; prereqMessage = 'Requires previous slot upgrades (Slot 9)';
    }
    const cost = Number(u.ip_cost||0);
    const affordable = ctx.meta && (ctx.meta.ip >= cost);
    let label;
    if(purchased) label = 'Purchased';
    else if(prereqLocked) label = (prereqMessage || 'Requires previous purchase');
    else label = 'Buy: ' + cost + ' IP';
    const b = el('button',{class:'btn'},[ label ]);
    if(purchased || prereqLocked) b.setAttribute('disabled','');
    else if(!affordable) b.setAttribute('disabled','');
    b.addEventListener('click',()=>{ if(ctx.buyUpgrade) ctx.buyUpgrade(u.id); else if(ctx.setMessage) ctx.setMessage('No buy handler'); });
    item.appendChild(b);
    upGrid.appendChild(item);
  });
  metaSec.appendChild(upGrid);
  container.appendChild(metaSec);

  // Legendary Store (hidden unless unlocked)
  if(ctx.meta && ctx.meta.legendaryUnlocked){
    const legSec = section('Legendary Store');
    const lGrid = el('div',{class:'card-grid legendary-grid'},[]);
    (ctx.data.legendary||[]).forEach(it=>{
      const elCard = el('div',{class:'card-wrap panel'},[]);
      // cost and purchase button
      const footer = el('div',{class:'row'},[]);
      // determine if this legendary is a hero/card (has hp or explicit kind)
      const isCard = typeof it.hp === 'number';
      const owned = isCard ? (ctx.meta && Array.isArray(ctx.meta.ownedCards) && ctx.meta.ownedCards.includes(it.id)) : (ctx.meta && Array.isArray(ctx.meta.ownedSummons) && ctx.meta.ownedSummons.includes(it.id));
      const cost = Number(it.ip_cost||0);
      const buy = el('button',{class:'btn'},[ owned ? 'Purchased' : ('Recruit: '+cost+' IP') ]);
      if(owned) buy.setAttribute('disabled','');
      else if(ctx.meta && ctx.meta.ip < cost) buy.setAttribute('disabled','');
      buy.addEventListener('click',()=>{ if(ctx.buyLegendary) ctx.buyLegendary(it.id); else if(ctx.setMessage) ctx.setMessage('No buy handler'); });
      footer.appendChild(buy);
      // use the shared cardTile renderer so images/icons are shown consistently
      // add a special class for Blackrazor so we can size its image differently
      if(it && it.id === 'blackrazor'){ try{ elCard.classList.add('blackrazor'); }catch(e){} }
      try{ if(it && it.id === 'blackrazor') lOpts.imageOverride = './assets/Blackrazor.png'; }catch(e){}
      // Legendary store: render fixed griff1 for Griff
      const lOpts = { hideSlot: !isCard, hideCost: true, footer };
      try{ if(it && it.id === 'griff') lOpts.imageOverride = './assets/griff1.png'; }catch(e){}
      elCard.appendChild(cardTile(it, lOpts));
      lGrid.appendChild(elCard);
    });
    legSec.appendChild(lGrid);
    container.appendChild(legSec);
  }
  wrapper.appendChild(container);
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

    wrapper.appendChild(musicBtn);
    wrapper.appendChild(musicPanel);
  }catch(e){ /* ignore if AudioManager unavailable */ }

  root.appendChild(wrapper);
}

