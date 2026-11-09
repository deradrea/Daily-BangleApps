/* Trusted boot integration only. No storage key guessing, provisioning,
 * console changes, time assertions or entropy fallback are performed here. */
exports.attach=function(env) {
  var node=env.node;
  if(!node || !node.samples || typeof node.changed!=="function" || node.administration)
    throw new Error("Runtime amministrativo non disponibile");
  var asynchronous=env.driver.create({verifier:env.verifier,clock:env.clock});
  var manager=env.erase.create({journal:node.samples,core:env.core,storage:env.storage,
    authorization:env.authorization,verifyAsync:asynchronous,sha256:env.sha256,
    trust:env.trust,binding:env.binding,time:env.time,monotonic:env.monotonic,randomHex:env.randomHex,
    executionEnabled:env.executionEnabled,resourcesValidated:env.resourcesValidated,consoleDisabled:env.consoleDisabled});
  var controller=env.controller.create({manager:manager,clock:env.clock,
    stats:function(){return node.samples.stats();},changed:function(){node.changed();}});
  node.administration=controller;
  return controller;
};
