/* Cooperative public-key verification. Only the private scheduled job can
 * produce success; transport commands cannot submit a verification result. */
exports.create=function(env) {
  return function(message,signature,key,progress,complete) {
    var job=env.verifier.create(message,signature,key),cancelled=false,timer,steps=0,last=-1;
    function reject(){if(cancelled)return;cancelled=true;job=null;complete(false);}
    function next(){try{timer=env.clock.setTimeout(tick,1);}catch(e){reject();}}
    function tick(){
      timer=undefined;if(cancelled)return;
      var result;
      try {result=job.step();if(++steps>765)throw new Error("Verification budget exceeded");}
      catch(e){reject();return;}
      try{if(progress && result.progress!==last){last=result.progress;progress(result.progress);}}
      catch(e){reject();return;}
      // A UI observer may synchronously cancel or dispose the operation. In
      // particular, cancellation at 100% must never become a valid proof.
      if(cancelled)return;
      if(result.done){cancelled=true;job=null;complete(result.valid===true);}
      else next();
    }
    next();
    return function(){cancelled=true;job=null;if(timer!==undefined)env.clock.clearTimeout(timer);timer=undefined;};
  };
};
