/* UI orchestration only. The signed erase engine owns every security check and
 * durable intent. No local PIN, server-grant fabrication or crypto fallback. */
exports.create = function(env) {
  var manager=env.manager, timer, challengeTimer, disposed=false, offered=null, challenge=null,cancelVerification=null;
  var state={phase:manager.status().pending ? "interrupted" : "idle", removed:null,total:null,error:null};
  function publish(){if(env.changed)env.changed();}
  function copy(v){return v ? JSON.parse(JSON.stringify(v)) : v;}
  function stopChallengeTimer() {
    if(challengeTimer!==undefined)env.clock.clearTimeout(challengeTimer);
    challengeTimer=undefined;
  }
  function releaseChallenge() {
    stopChallengeTimer();
    if(!manager.status().pending && manager.cancelChallenge)manager.cancelChallenge();
    offered=null;challenge=null;
  }
  function fail(){state.phase="interrupted";state.error="Cancellazione da verificare";publish();}
  function advance(resuming) {
    if(disposed)return;
    try {
      var result=resuming ? manager.resume() : manager.step();
      if(result.state==="completed") {
        state.phase="completed";state.removed=result.removed;state.total=result.removed;
        state.receipt=copy(result);offered=null;publish();return;
      }
      var stats=env.stats(),remaining=manager.status().remaining;
      if(state.total!==null && typeof remaining==="number")state.removed=Math.max(0,state.total-remaining);
      else if(state.total!==null && stats && typeof stats.stored==="number")state.removed=Math.max(0,state.total-stats.stored);
      publish();schedule(false);
    } catch(e){fail();}
  }
  function schedule(resuming){timer=env.clock.setTimeout(function(){timer=undefined;advance(resuming);},20);}
  function prepare(operationId) {
    if(disposed || state.phase==="running" || state.phase==="verifying" || manager.status().pending)throw new Error("Ripresa richiesta");
    releaseChallenge();
    challenge=manager.challenge(operationId);
    try {
      challengeTimer=env.clock.setTimeout(function(){
        releaseChallenge();
        state.phase="rejected";state.error="Autorizzazione scaduta";publish();
      },60000);
    } catch(e) {
      releaseChallenge();
      throw e;
    }
    state={phase:"awaiting_authorization",total:challenge.stored,pending:challenge.pending,removed:0,error:null};
    publish();return copy(challenge);
  }
  function offer(grant) {
    if(disposed || state.phase!=="awaiting_authorization" || !challenge || !grant || !grant.body ||
        grant.body.operationId!==challenge.operationId)throw new Error("Richiesta diversa");
    // A received grant is still untrusted: begin() verifies it only after the
    // physical confirmation. Never label this state as authorization verified.
    offered=copy(grant);state.phase="confirmation";publish();
  }
  function confirm() {
    if(disposed || state.phase!=="confirmation" || !offered)throw new Error("Conferma non disponibile");
    stopChallengeTimer();
    try {
      if(manager.cooperative) {
        state.phase="verifying";state.verificationPercent=0;publish();
        cancelVerification=manager.beginAsync(offered,function(percent){if(!disposed){state.verificationPercent=percent;publish();}},verified);
        return;
      }
      var result=manager.begin(offered);
      if(result.state==="completed") {state.phase="completed";state.receipt=copy(result);publish();return;}
      state.phase="running";state.error=null;publish();schedule(false);
    } catch(e) {state.phase=manager.status().pending ? "interrupted" : "rejected";
      state.error="Autorizzazione non valida: ripeti da Vera";releaseChallenge();publish();}
  }
  function verified(result,error) {
    cancelVerification=null;if(disposed)return;
    if(error){state.phase=manager.status().pending?"interrupted":"rejected";state.error="Verifica non completata: rileggi da Vera";releaseChallenge();publish();return;}
    if(result.state==="completed"){state.phase="completed";state.removed=result.removed;state.total=result.removed;state.receipt=copy(result);publish();return;}
    state.phase="running";state.error=null;publish();schedule(false);
  }
  function resume() {
    if(disposed || state.phase==="running" || state.phase==="verifying" || !manager.status().pending)throw new Error("Nessuna ripresa disponibile");
    var pendingStatus=manager.status();state.total=pendingStatus.total;state.removed=typeof pendingStatus.total==="number"?pendingStatus.total-pendingStatus.remaining:null;
    if(manager.cooperative){state.phase="verifying";state.verificationPercent=0;publish();
      try{cancelVerification=manager.resumeAsync(function(percent){if(!disposed){state.verificationPercent=percent;publish();}},verified);}
      catch(e){fail();}return;}
    state.phase="running";state.error=null;publish();schedule(true);
  }
  function cancel() {
    if(manager.status().pending || state.phase==="running")return false;
    if(cancelVerification){cancelVerification();cancelVerification=null;}
    releaseChallenge();state={phase:"idle",removed:null,total:null,error:null};publish();return true;
  }
  return {prepare:prepare,plan:function(operationId){if(!challenge || challenge.operationId!==operationId)throw new Error("Richiesta diversa");return manager.challengePlan();},offer:offer,confirm:confirm,resume:resume,cancel:cancel,
    status:function(){var result=copy(state),durable=manager.status();result.executionEnabled=manager.ready();result.pending=durable.pending;
      if(!result.receipt && durable.last)result.lastReceipt=copy(durable.last);return result;},
    dispose:function(){disposed=true;if(cancelVerification)cancelVerification();cancelVerification=null;if(timer!==undefined)env.clock.clearTimeout(timer);timer=undefined;
      releaseChallenge();}};
};
