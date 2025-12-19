const MUSIC_ENABLED_KEY = 'vcg_music_enabled_v1';
const MUSIC_VOLUME_KEY = 'vcg_music_volume_v1';

export const AudioManager = {
  audio: null,
  currentSrc: null,
  masterMultiplier: 0.8,
  enabled: true,
  volume: 0.15,
  _fadeRaf: null,
  _fadeCancel: false,
  fadeDuration: 300, /* milliseconds */
  

  init(src, { autoplay = true, loop = true, volume } = {}){
    if(!src) return;
    // If the requested src is the same as the currently loaded one, avoid
    // recreating the Audio object since many screens re-render on button
    // presses. Only update playback/loop/volume in that case.
    if(this.currentSrc === src && this.audio){
      try{
        if(typeof loop === 'boolean') this.audio.loop = !!loop;
        const storedVol = parseFloat(localStorage.getItem(MUSIC_VOLUME_KEY));
        this.volume = (typeof volume === 'number') ? volume : (isNaN(storedVol) ? this.volume : storedVol);
        try{ this.audio.volume = Math.max(0, Math.min(1, this.volume * this.masterMultiplier)); }catch(e){}
        if(this.enabled && autoplay){ try{ if(this.audio.paused) { const p = this.audio.play(); if(p && p.catch) p.catch(()=>{}); } }catch(e){} }
      }catch(e){ /* ignore */ }
      return;
    }
    try{
      // If an audio instance already exists, stop and clear it first to ensure only the
      // requested track plays (prevents orphaned audio objects continuing to play).
      if(this.audio){
        // fade out the existing audio element (capture it so we don't affect the new one)
        try{
          const old = this.audio;
          this._fadeTo(0, this.fadeDuration, ()=>{
            try{ old.pause(); }catch(e){}
            try{ old.src = ''; }catch(e){}
          }, old);
        }catch(e){ try{ this.audio.pause(); this.audio.src = ''; }catch(e){} }
      }
      this.currentSrc = src;
      this.audio = new Audio(src);
      this.audio.loop = !!loop;
      const storedVol = parseFloat(localStorage.getItem(MUSIC_VOLUME_KEY));
      this.volume = (typeof volume === 'number') ? volume : (isNaN(storedVol) ? 0.15 : storedVol);
      try{ this.audio.volume = 0; }catch(e){}
      const storedEnabled = localStorage.getItem(MUSIC_ENABLED_KEY);
      this.enabled = (storedEnabled === null) ? true : (storedEnabled === '1');
      if(this.enabled && autoplay){
        const p = this.audio.play();
        if(p && p.catch) p.catch(()=>{});
        // fade up to target volume
        this._fadeTo(Math.max(0, Math.min(1, this.volume * this.masterMultiplier)), this.fadeDuration);
      }
    }catch(e){
      console.warn('AudioManager.init failed', e);
    }
  },

  play(){ 
    if(this.audio && this.enabled){ 
      try{ 
        if(this.audio.paused){ 
          const p = this.audio.play(); if(p && p.catch) p.catch(()=>{}); 
        }
        // fade to current desired volume
        this._fadeTo(Math.max(0, Math.min(1, this.volume * this.masterMultiplier)), this.fadeDuration);
      }catch(e){}
    } 
  },

  pause(){ 
    if(this.audio) try{ 
      // gracefully fade out then pause
      this._fadeTo(0, this.fadeDuration, ()=>{ try{ this.audio.pause(); }catch(e){} });
    }catch(e){} 
  },

  stop(){
    if(this.audio){
      // fade out then clear
      try{
        this._fadeTo(0, this.fadeDuration, ()=>{
          try{ this.audio.pause(); }catch(e){}
          try{ this.audio.currentTime = 0; }catch(e){}
          try{ this.audio.src = ''; }catch(e){}
          this.currentSrc = null;
        });
      }catch(e){
        try{ this.audio.pause(); this.audio.currentTime = 0; this.audio.src = ''; }catch(e){}
        this.currentSrc = null;
      }
    }
  },

  setEnabled(on){ this.enabled = !!on; try{ localStorage.setItem(MUSIC_ENABLED_KEY, this.enabled ? '1' : '0'); }catch(e){} if(this.enabled) this.play(); else this.pause(); },
  toggle(){ this.setEnabled(!this.enabled); return this.enabled; },

  setVolume(v){
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    try{ localStorage.setItem(MUSIC_VOLUME_KEY, String(this.volume)); }catch(e){}
    if(this.audio){
      // fade to new target volume smoothly
      this._fadeTo(Math.max(0, Math.min(1, this.volume * this.masterMultiplier)), 180);
    }
  },

  setLoop(on){ try{ if(this.audio) this.audio.loop = !!on; }catch(e){} },

  /* internal: smoothly ramp audio.volume to target (0..1) over duration ms */
  _fadeTo(target, duration = 300, onComplete, audioEl){
    const el = audioEl || this.audio;
    if(!el) { if(typeof onComplete === 'function') onComplete(); return; }
    const start = performance.now();
    const initial = Number(el.volume) || 0;
    const delta = target - initial;
    let raf = null;
    const step = (now) => {
      const t = Math.min(1, (now - start) / Math.max(1, duration));
      const v = initial + delta * t;
      try{ el.volume = Math.max(0, Math.min(1, v)); }catch(e){}
      if(t < 1){
        raf = requestAnimationFrame(step);
      }else{
        if(typeof onComplete === 'function') onComplete();
      }
    };
    raf = requestAnimationFrame(step);
    return () => { if(raf) cancelAnimationFrame(raf); };
  },

  isEnabled(){ return this.enabled; },
  getVolume(){ return this.volume; }
};

export default AudioManager;
