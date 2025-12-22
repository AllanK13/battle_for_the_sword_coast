export function el(tag, attrs={}, children=[]){
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{ if(k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v); else e.setAttribute(k,v); });
  if(typeof children === 'string') e.textContent = children;
  else children.forEach(c=>{
    if(c === null || typeof c === 'undefined') return;
    if(typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') e.appendChild(document.createTextNode(String(c)));
    else e.appendChild(c);
  });
  return e;
}

export function cardTile(item, opts={}){
  // Show image asset (assets/<name>.png or .jpg) and stats underneath
  const d = el('div',{class:'card panel'});
  // build candidate base names (prefer id, then various name transformations)
  const bases = [];
  if(item.id) bases.push(item.id);
  if(item.name) bases.push(item.name);
  if(item.name) bases.push(item.name.replace(/\s+/g,'_'));
  if(item.name) bases.push(item.name.replace(/\s+/g,'').toLowerCase());
  if(item.name) bases.push(item.name.replace(/\s+/g,'_').toLowerCase());
  // Special-case: Griff uses multiple numbered art assets (griff1..griff7).
  // Try those first when rendering a Griff card so we pick an existing file.
  if(item.id === 'griff'){
    const griffs = [];
    for(let i=1;i<=7;i++) griffs.push('griff'+i);
    bases.unshift(...griffs);
  }
  // dedupe
  const seen = new Set();
  const candidates = bases.filter(b=>{ if(!b) return false; const k=b; if(seen.has(k)) return false; seen.add(k); return true; });
  const exts = ['png','jpg','webp'];
  let tryIndex = 0;
  const img = el('img',{alt:item.name, class:'card-image'});
  // allow callers to force a specific image filename (e.g., per-encounter variant)
  if(opts.imageOverride){
    try{
      // if override looks like a path, use it; otherwise treat as asset filename
      if(typeof opts.imageOverride === 'string'){
        // normalize common asset-style overrides so they resolve relative to the app
        const o = opts.imageOverride;
        if(o.indexOf('/') === -1){
          img.src = './assets/'+encodeURIComponent(o);
        } else if(o.startsWith('assets/')){
          img.src = './'+o;
        } else {
          img.src = o;
        }
      }
    }catch(e){}
  }
  img.addEventListener('error', ()=>{
    // advance to next candidate
    tryIndex++;
    const total = candidates.length * exts.length;
    if(tryIndex >= total){ img.style.display='none'; return; }
    const ci = Math.floor(tryIndex / exts.length);
    const ei = tryIndex % exts.length;
    img.src = './assets/'+encodeURIComponent(candidates[ci])+'.'+exts[ei];
  });
  // start with first candidate only if no override already set
  if(!img.src){
    if(candidates.length>0){ img.src = './assets/'+encodeURIComponent(candidates[0])+'.png'; }
    else { img.style.display='none'; }
  }
  d.appendChild(img);
  // insert a name label above the image if present (shows character/summon/enemy names)
  if(item.name){
    const nameEl = el('div',{class:'card-name'},[item.name]);
    d.insertBefore(nameEl, img);
  }
  // stats / body container (allows wrapping and consistent card size)
  const stats = el('div',{class:'card-body'},[]);
  const hpToShow = (typeof opts.currentHp !== 'undefined') ? opts.currentHp : item.hp;
  // allow callers to request slot shown before HP
  if(opts.slotFirst){
    if(typeof item.slot_cost !== 'undefined' && !opts.hideSlot) stats.appendChild(el('div',{class:'muted card-stat'},['Party Slots: '+item.slot_cost]));
    if(typeof hpToShow !== 'undefined' && !opts.hideHp) stats.appendChild(el('div',{class:'muted card-stat'},['HP: '+hpToShow]));
  } else {
    if(typeof hpToShow !== 'undefined' && !opts.hideHp) stats.appendChild(el('div',{class:'muted card-stat'},['HP: '+hpToShow]));
    if(typeof item.slot_cost !== 'undefined' && !opts.hideSlot) stats.appendChild(el('div',{class:'muted card-stat'},['Party Slots: '+item.slot_cost]));
  }
  if(!opts.hideCost && typeof item.ip_cost !== 'undefined') stats.appendChild(el('div',{class:'muted card-stat'},['Cost: '+item.ip_cost]));
  // Prefer structured `abilities[]` primary entry; fall back to legacy `ability` string
  let primary = null;
  try{ if(item && Array.isArray(item.abilities) && item.abilities.length>0) primary = item.abilities.find(a=>a.primary) || item.abilities[0]; }catch(e){}
  const abilityText = (primary && primary.ability) ? primary.ability : (item.ability || null);
  if(abilityText) stats.appendChild(el('div',{class:'muted card-desc'},[abilityText]));
  d.appendChild(stats);
  // if caller provided a footer element, append it inside the card so it stays anchored
  if(opts.footer){
    try{ opts.footer.classList.add('card-footer'); }catch(e){}
    d.appendChild(opts.footer);
  }
  // show temp HP badge (top-left) only when temp HP is a positive number
  if(typeof opts.tempHp !== 'undefined' && Number(opts.tempHp) > 0){
    try{ d.style.position = d.style.position || 'relative'; }catch(e){}
    const t = el('div',{class:'card-temp-hp'},[ String(opts.tempHp) ]);
    d.appendChild(t);
  }
  return d;
}
