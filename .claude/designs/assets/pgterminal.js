// Mock chrome: theme toggle (persisted), annotation toggle, keyboard: t = theme, n = notes.
(function(){
  var root=document.documentElement;
  function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function set(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  var q=/[?&]theme=(dark|light)/.exec(location.search);
  var theme=(q&&q[1])||get('pgterminal-mock-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  if(/[?&]notes=off/.test(location.search))set('pgterminal-mock-notes','off');
  root.setAttribute('data-theme',theme);
  var notes=get('pgterminal-mock-notes')!=='off';
  root.classList.toggle('no-notes',!notes);
  function build(){
    var bar=document.createElement('div');bar.className='mock-bar';
    bar.innerHTML='<a href="index.html">← Gallery</a>'+
      '<button data-act="theme">'+(theme==='dark'?'☾ Dark':'☀ Light')+'</button>'+
      '<button data-act="notes" class="'+(notes?'on':'')+'">Notes</button>';
    bar.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;
      if(b.dataset.act==='theme'){theme=theme==='dark'?'light':'dark';root.setAttribute('data-theme',theme);set('pgterminal-mock-theme',theme);b.textContent=theme==='dark'?'☾ Dark':'☀ Light';}
      if(b.dataset.act==='notes'){notes=!notes;root.classList.toggle('no-notes',!notes);b.classList.toggle('on',notes);set('pgterminal-mock-notes',notes?'on':'off');}
    });
    document.body.appendChild(bar);
    var st=document.createElement('style');st.textContent='.no-notes .mock-note{display:none}';document.head.appendChild(st);
  }
  document.addEventListener('keydown',function(e){
    if(e.target.matches('input,textarea'))return;
    if(e.key==='t'){document.querySelector('.mock-bar [data-act=theme]').click()}
    if(e.key==='n'){document.querySelector('.mock-bar [data-act=notes]').click()}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();
