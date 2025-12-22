import { el } from '../renderer.js';
import { AudioManager } from '../../engine/audio.js';

export function renderEncounterEnd(root, ctx){
  const enemy = ctx.enemy || {};
  const enemyId = enemy.id || enemy.name || 'Enemy';
  const enemyName = enemy.name || enemyId;

  // Play victory music for encounter completion (stop previous music first)
  try{
    const musicCandidates = ['./assets/music/victory.mp3','assets/music/victory.mp3','/assets/music/victory.mp3'];
    AudioManager.init(musicCandidates[0], { autoplay:true, loop:false });
    // Turn down victory track by 20% (use AudioManager so multiplier applies);
    try{
      const base = (AudioManager.getVolume ? AudioManager.getVolume() : (AudioManager.audio && typeof AudioManager.audio.volume === 'number' ? AudioManager.audio.volume : 1));
      ctx._victoryPrevVol = base;
      // Turn down victory track to 40% of base (quieter)
      AudioManager.setVolume(Math.max(0, base * 0.10));
    }catch(e){/* ignore */}
  }catch(e){ /* ignore audio init failures */ }

  const container = el('div',{class:'end-screen'},[]);
  container.appendChild(el('h1',{class:'end-title'},['Encounter Complete']));

  const summary = el('div',{class:'end-summary panel'},[]);

  // Killed enemy preview
  const killedWrap = el('div',{},[]);
  const killedName = el('div',{class:'end-stat'},['You killed: ' + enemyName]);
  killedWrap.appendChild(killedName);
  // try to show an image if possible (non-fatal fallback)
  if(enemy.img || enemy.image){
    const img = el('img',{src: enemy.img || enemy.image, style: 'max-width:220px;max-height:160px;margin-top:8px;border-radius:8px;'},[]);
    killedWrap.appendChild(img);
  }
  summary.appendChild(killedWrap);

  // Reward display
  const rewardStat = el('div',{class:'end-stat'},['IP gained: '+(ctx.reward||0)]);
  summary.appendChild(rewardStat);

  container.appendChild(summary);

  const btnRow = el('div',{class:'end-btns'},[]);
  const cont = el('button',{class:'btn end-back-btn'},['Continue']);
  cont.addEventListener('click',()=>{
    // restore volume if we reduced it for the victory track
    try{
      if(typeof ctx._victoryPrevVol !== 'undefined'){
        AudioManager.setVolume(ctx._victoryPrevVol);
        delete ctx._victoryPrevVol;
      }
    }catch(e){}
    if(ctx.onContinue) ctx.onContinue();
  });
  btnRow.appendChild(cont);
  container.appendChild(btnRow);

  root.appendChild(container);

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
}
