import { el } from '../renderer.js';
import { AudioManager } from '../../engine/audio.js';

export function renderEnd(root, ctx){
  const rs = ctx.runSummary || { defeated: [], diedTo: null, ipEarned: 0 };
  const container = el('div',{class:'end-screen'},[]);
  container.appendChild(el('h1',{class:'end-title'},['Run Summary']));

  const summary = el('div',{class:'end-summary panel'},[]);
  summary.appendChild(el('div',{class:'end-stat'},['IP earned: '+(rs.ipEarned||0)]));
  // V interest display (if applicable)
  if(ctx.vInterest && Number(ctx.vInterest) > 0){
    summary.appendChild(el('div',{class:'end-stat'},['V interest earned: '+Number(ctx.vInterest)]));
  }
  summary.appendChild(el('div',{class:'end-stat'},['Bosses defeated:']));
  const ul = el('ul',{class:'end-list'},[]);
  (rs.defeated||[]).forEach(id=>{
    const name = (ctx.data && ctx.data.enemies) ? (ctx.data.enemies.find(e=>e.id===id)||{}).name || id : id;
    ul.appendChild(el('li',{},[name]));
  });
  summary.appendChild(ul);
  if(rs.diedTo){
    const diedName = (ctx.data && ctx.data.enemies) ? (ctx.data.enemies.find(e=>e.id===rs.diedTo)||{}).name || rs.diedTo : rs.diedTo;
    summary.appendChild(el('div',{class:'end-stat end-died'},['Died to: '+diedName]));
  } else {
    summary.appendChild(el('div',{class:'end-stat end-survived'},['You survived the run']));
  }

  container.appendChild(summary);

  const btnRow = el('div',{class:'end-btns'},[]);
  const back = el('button',{class:'btn end-back-btn'},['Back to Menu']);
  back.addEventListener('click',()=> ctx.onRestart());
  btnRow.appendChild(back);
  container.appendChild(btnRow);

  root.appendChild(container);

  // When showing the end screen, play end music (stop previous audio first)
  try{
    const musicCandidates = ['./assets/music/end.mp3','assets/music/end.mp3','/assets/music/end.mp3'];
    AudioManager.init(musicCandidates[0], { autoplay:true, loop:false });
  }catch(e){ /* ignore audio init failures */ }

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
