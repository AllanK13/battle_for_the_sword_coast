const routes = {};
let currentRoot = null;
let _currentRouteName = null;
export function register(name, renderFn){ routes[name]=renderFn; }
export function navigate(name, params){
  const root = document.getElementById('app');
  root.innerHTML='';
  currentRoot = root;
  // Scroll to top only when navigating to a different route name, or when explicitly forced
  const force = params && (params.forceScroll === true || params.scrollToTop === true);
  if(force || name !== _currentRouteName){
    try{
      if(typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }catch(e){}
    try{ root.scrollTop = 0; document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }catch(e){}
  }
  _currentRouteName = name;
  const fn = routes[name];
  if(!fn) { root.textContent = 'Route not found: '+name; return }
  fn(root, params);
}
