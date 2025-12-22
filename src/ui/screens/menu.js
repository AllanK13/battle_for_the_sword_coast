import { el } from '../renderer.js';
import { AudioManager } from '../../engine/audio.js';

export function renderMenu(root, ctx={}){
  const container = el('div',{class:'menu-screen'},[]);
  const titleText = (ctx && ctx.meta && ctx.meta.gameName) ? ctx.meta.gameName : 'Battle for the Sword Coast';
  const titleEl = el('h1',{class:'game-title'},[ titleText ]);
  container.appendChild(titleEl);
  const logo = el('img',{src:'assets/title_logo.png', alt:titleText, class:'menu-logo'});
  logo.addEventListener('error', ()=>{ logo.src='assets/title_logo.jpg'; });
  logo.addEventListener('error', ()=>{ logo.style.display='none'; });
  container.appendChild(logo);

  const btnWrap = el('div',{class:'menu-buttons'},[]);
  function createBtn(label, onClick, disabled){
    const attrs = { class: 'btn menu-button', type: 'button' };
    if(disabled){ attrs.class += ' disabled'; attrs['aria-disabled'] = 'true'; attrs.disabled = 'true'; }
    const b = el('button', attrs, [ label ]);
    if(!disabled && typeof onClick === 'function') b.addEventListener('click', onClick);
    else if(disabled){
      // show a small badge and optionally notify host when locked buttons are attempted
      const badge = el('div',{class:'coming-soon-badge'},['Coming Soon']);
      b.appendChild(badge);
      b.addEventListener('click', ()=>{ if(typeof ctx.onAttemptLocked === 'function') ctx.onAttemptLocked(label); });
    }
    return b;
  }

  const arcadeBtn = createBtn('Arcade Mode', ()=>{ if(typeof ctx.onArcade === 'function') ctx.onArcade(); }, false);
  // mark arcade button for specialized styling and add a small icon
  try{ arcadeBtn.classList.add('arcade'); const icon = el('span',{class:'menu-btn-icon-left'},['🎮']); arcadeBtn.insertBefore(icon, arcadeBtn.firstChild); }catch(e){}
  const adventureBtn = createBtn('Adventure Mode', null, true);
  try{ adventureBtn.classList.add('adventure'); const aicon = el('span',{class:'menu-btn-icon-left'},['🗺️']); adventureBtn.insertBefore(aicon, adventureBtn.firstChild); }catch(e){}
  const campaignBtn = createBtn('Campaign Mode', null, true);
  try{ campaignBtn.classList.add('campaign'); const cicon = el('span',{class:'menu-btn-icon-left'},['🏰']); campaignBtn.insertBefore(cicon, campaignBtn.firstChild); }catch(e){}

  // layout: Arcade first, then the locked modes
  btnWrap.appendChild(arcadeBtn);
  btnWrap.appendChild(adventureBtn);
  btnWrap.appendChild(campaignBtn);
  container.appendChild(btnWrap);

  // Floating music control (copy from arcade_start)
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

  root.appendChild(container);
}
