/* Dedicated device: the system launcher returns to Vera, never to an app list. */
(function(){
  if(typeof require('Storage').read('veranode.app.js')!=='string'){
    E.showMessage('Collega Vera App\nper il ripristino','VERA');return;
  }
  if(!global.VeraNode){load();return;}
  load('veranode.app.js');
})();
