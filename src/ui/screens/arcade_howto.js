import { el } from '../renderer.js';

export function renderHowTo(root, ctx){
  const wrapper = el('div',{style:'position:relative;padding-top:48px'},[]);
  const container = el('div',{class:'panel stats-screen'},[]);
  container.appendChild(el('h2',{class:'stats-title'},['How to Play']));

  // Sections broken into two responsive columns
  const leftSections = [
    { title: '🎯 Goal', body: ['Defeat each enemy in sequence. If all your heroes fall in a fight, the run ends.'] },
    { title: '👥 The Battlefield', body: ['You may have up to 3 heroes on the field: 2 Frontline, 1 Backline. Single-target enemy attacks hit frontline only. AoE attacks hit all heroes. Placing a hero into an empty slot is free. If a hero is defeated, they are unavailable for the rest of that fight.'] },
    { title: '⚡ Action Points (AP)', body: ['Each turn, you have a limited number of Action Points. Unused AP are lost at the end of your turn.'] },
    { title: 'Actions', body: ['Use a hero’s Ability - 1 AP', 'Dodge - 1 AP', 'Replace a hero - 1 AP', 'Place hero (empty slot) - Free', 'Use a Summon - Free'] }
  ];

  const rightSections = [
    { title: '🗡️ Actions Explained', body: ['Ability: Use a hero’s special action.', 'Dodge: Harder to hit from attacks.', 'Replace: Remove a hero to make room for another.'] },
    { title: '🧙 Summons', body: ['Summons are always available. They cost no AP. Each summon has restrictions on how often it can be used.'] },
    { title: '👹 Enemies', body: ['Each enemy has multiple attacks. On their turn, the enemy chooses one attack at random. Enemies grow more dangerous as you progress.'] },
    { title: '🧠 Your Deck', body: ['You always have access to all cards in your deck. Cards take up party slots. You start with 3 slots.'] },
    { title: '🏆 Winning & Losing', body: ['Win: Enemy HP reaches 0.', 'Lose: No heroes remain on the battlefield.'] }
  ];

  const helpPanel = el('div',{class:'panel help-panel', style:'margin-top:6px;padding:12px'},[]);
  const cols = el('div',{class:'howto-columns'},[]);

  const leftCol = el('div',{},[]);
  leftSections.forEach(s => {
    const sec = el('div',{class:'howto-section'},[]);
    sec.appendChild(el('div',{class:'howto-legend'},[s.title]));
    // If multiple lines, render as list
    if(s.body.length > 1){
      const ul = el('ul',{class:'howto-list'},[]);
      s.body.forEach(line => ul.appendChild(el('li',{},[line])));
      sec.appendChild(ul);
    } else {
      s.body.forEach(p => sec.appendChild(el('p',{},[p])));
    }
    leftCol.appendChild(sec);
  });

  const rightCol = el('div',{},[]);
  rightSections.forEach(s => {
    const sec = el('div',{class:'howto-section'},[]);
    sec.appendChild(el('div',{class:'howto-legend'},[s.title]));
    // If multiple lines, render as list
    if(s.body.length > 1){
      const ul = el('ul',{class:'howto-list'},[]);
      s.body.forEach(line => ul.appendChild(el('li',{},[line])));
      sec.appendChild(ul);
    } else {
      s.body.forEach(p => sec.appendChild(el('p',{},[p])));
    }
    rightCol.appendChild(sec);
  });

  cols.appendChild(leftCol);
  cols.appendChild(rightCol);
  helpPanel.appendChild(cols);

  // final inspirational footer
  const footerQuote = el('div',{class:'card-name', style:'text-align:center;margin-top:12px'},["Learn from each run. Adapt your strategy. Defend the Sword Coast."]);
  helpPanel.appendChild(footerQuote);

  const back = el('button',{class:'btn stats-back-btn', style:'position:absolute;right:12px;top:8px'},['Back']);
  back.addEventListener('click', ()=>{ if(ctx && ctx.onBack) ctx.onBack(); else if(window.navigate) window.navigate('arcade_start'); });

  container.appendChild(helpPanel);
  container.appendChild(back);
  wrapper.appendChild(container);
  root.appendChild(wrapper);
}
