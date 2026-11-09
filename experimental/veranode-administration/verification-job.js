/* Embedded inside the pinned TweetNaCl closure by the evaluation builder.
 * Equivalent joint public-scalar verification over the pinned point/field
 * primitives; one bit/exponent iteration per step. No private scalar is used.
 * No signing, random source, scheduler or erase access. */
nacl.verificationJob = function(input) {
  var msg=new Uint8Array(input.message),sig=new Uint8Array(input.signature),pk=new Uint8Array(input.publicKey);
  var p=[gf(),gf(),gf(),gf()],q=[gf(),gf(),gf(),gf()],base,combined;
  var t=gf(),num=gf(),den=gf(),den2=gf(),den4=gf(),den6=gf(),chk=gf(),c=gf();
  var h=new Uint8Array(64),stage=0,i=0,ticks=0,done=false,valid=false;
  function identity(point) {set25519(point[0],gf0);set25519(point[1],gf1);set25519(point[2],gf1);set25519(point[3],gf0);}
  function result(){return {done:done,valid:done && valid,progress:done?100:Math.min(99,Math.floor(ticks*100/764)),phase:stage<3?"key":stage<5?"signature":"comparison"};}
  function step() {
    if(done)return result();
    ticks++;
    if(stage===0) {
      set25519(q[2],gf1);unpack25519(q[1],pk);S(num,q[1]);M(den,num,D);Z(num,num,q[2]);A(den,q[2],den);
      S(den2,den);S(den4,den2);M(den6,den4,den2);M(t,den6,num);M(t,t,den);
      set25519(c,t);i=250;stage=1;
    } else if(stage===1) {
      S(c,c);if(i!==1)M(c,c,t);if(--i<0){set25519(t,c);stage=2;}
    } else if(stage===2) {
      M(t,t,num);M(t,t,den);M(t,t,den);M(q[0],t,den);S(chk,q[0]);M(chk,chk,den);
      if(neq25519(chk,num))M(q[0],q[0],I);
      S(chk,q[0]);M(chk,chk,den);if(neq25519(chk,num)){done=true;return result();}
      if(par25519(q[0])===(pk[31]>>7))Z(q[0],gf0,q[0]);M(q[3],q[0],q[1]);
      var sm=new Uint8Array(64+msg.length),j;
      for(j=0;j<32;j++){sm[j]=sig[j];sm[j+32]=pk[j];}for(j=0;j<msg.length;j++)sm[j+64]=msg[j];
      crypto_hash(h,sm,sm.length);reduce(h);
      base=[gf(),gf(),gf(),gf()];set25519(base[0],X);set25519(base[1],Y);set25519(base[2],gf1);M(base[3],X,Y);
      combined=[gf(),gf(),gf(),gf()];for(j=0;j<4;j++)set25519(combined[j],q[j]);add(combined,base);
      identity(p);i=255;stage=3;
    } else if(stage===3) {
      // q=-A, base=B. Binary Shamir accumulation computes [S]B-[h]A
      // directly instead of two independent 256-bit ladders. Branches depend
      // only on public signature/hash bits; no signing key enters this module.
      var bit=((h[(i/8)|0]>>(i&7))&1)+2*((sig[32+((i/8)|0)]>>(i&7))&1);
      add(p,p);if(bit)add(p,bit===1?q:bit===2?base:combined);
      if(--i<0){set25519(c,p[2]);i=253;stage=5;}
    } else if(stage===5) {
      S(c,c);if(i!==2 && i!==4)M(c,c,p[2]);if(--i<0)stage=6;
    } else {
      var tx=gf(),ty=gf(),r=new Uint8Array(32);M(tx,p[0],c);M(ty,p[1],c);pack25519(r,ty);r[31]^=par25519(tx)<<7;
      valid=crypto_verify_32(sig,0,r,0)===0;done=true;
    }
    return result();
  }
  return {step:step,status:result};
};
