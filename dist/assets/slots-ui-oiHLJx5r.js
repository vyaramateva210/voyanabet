import{o as H,g as F,u as B,s as V,r as Y,i as k,p as K,a as U,b as N}from"./index-D0x6PG1v.js";const O={Cherry:30,Bar:20,Bell:15,Seven:10,Diamond:5,Jackpot:1},W=Object.values(O).reduce((i,e)=>i+e,0),P={JACKPOT_3X:100,DIAMOND_3X:25,SEVEN_3X:20,BELL_3X:10,BAR_3X:5,CHERRY_3X:3,JACKPOT_2X:15,DIAMOND_2X:5,SEVEN_2X:3,BELL_2X:2,BAR_2X:1,CHERRY_2X:1};function q(){const i=Object.keys(O),e=a=>O[a]/W;let l=0,n=0;for(const a of i){const o=e(a)**3,d=`${a.toUpperCase()}_3X`,m=P[d]??0;l+=o*m,m>0&&(n+=o)}for(const a of i){const o=e(a),d=3*o**2*(1-o),m=`${a.toUpperCase()}_2X`,p=P[m]??0;l+=d*p,p>0&&(n+=d)}return{winChance:parseFloat(n.toFixed(6)),jackpotChance:parseFloat((e("Jackpot")**3).toFixed(8)),expectedValuePerSpin:parseFloat(l.toFixed(6))}}const w=i=>new Promise(e=>setTimeout(e,i)),A=5,R=500,X=25,C=5,z=75,Q=500,E={Cherry:"🍒",Bar:"BAR",Bell:"🔔",Seven:"7",Diamond:"◆",Jackpot:"✦"},I={Cherry:"#ef4444",Bar:"#9ca3af",Bell:"#f5c842",Seven:"#ef4444",Diamond:"#38bdf8",Jackpot:"#f5c842"},D=Object.keys(E);function tt(i){i.innerHTML=`
    <section class="slots-screen">
      <div class="game-header">
        <h2 class="game-title">Slots</h2>
        <p class="game-subtitle muted">Weighted reels · Target RTP 92–96%</p>
      </div>

      <div class="lockout-banner hidden" id="slots-lockout">
        <span>⚠</span>
        <span id="slots-lockout-msg">COOLING OFF</span>
      </div>

      <div class="reels-container">
        ${[0,1,2].map(t=>`
          <div class="reel" id="reel-${t}">
            <div class="reel-frame">
              <span class="reel-symbol" style="color:${Object.values(I)[t]}">${Object.values(E)[t]}</span>
            </div>
          </div>`).join("")}
      </div>

      <div class="bet-controls">
        <button class="btn btn-ghost bet-btn" id="slots-bet-dec">−</button>
        <div class="bet-display">⬡ <span id="slots-bet-value">${X}</span></div>
        <button class="btn btn-ghost bet-btn" id="slots-bet-inc">+</button>
      </div>

      <button class="btn btn-primary spin-btn" id="slots-spin-btn">
        <span id="slots-spin-label">SPIN</span>
      </button>

      <div class="result-banner hidden" id="slots-result">
        <span id="slots-result-text"></span>
      </div>

      <div class="slots-hud-row muted" id="slots-hud-row"></div>
    </section>
  `;let e=X,l=!1,n=null,a=null;const o=document.getElementById("slots-spin-btn"),d=document.getElementById("slots-spin-label"),m=document.getElementById("slots-bet-value"),p=document.getElementById("slots-bet-dec"),y=document.getElementById("slots-bet-inc"),S=document.getElementById("slots-result"),M=document.getElementById("slots-result-text"),L=document.getElementById("slots-lockout"),T=document.getElementById("slots-lockout-msg"),j=document.getElementById("slots-hud-row"),_=[0,1,2].map(t=>document.getElementById(`reel-${t}`));function x(){const t=q();j.textContent=`Win: ${(t.winChance*100).toFixed(2)}%  ·  Jackpot: ${(t.jackpotChance*100).toFixed(4)}%  ·  EV: ${t.expectedValuePerSpin.toFixed(4)}`,window.dispatchEvent(new CustomEvent("voyanabet:hud",{detail:{type:"slots",data:t}}))}x();function b(){m.textContent=e,p.disabled=e<=A||l,y.disabled=e>=R||l||e+C>F()}p.addEventListener("click",()=>{e=Math.max(A,e-C),b()}),y.addEventListener("click",()=>{e=Math.min(R,e+C),b()}),a=H(()=>b());function $(){return k()?(L.classList.remove("hidden"),o.disabled=!0,T.textContent=`COOLING OFF — ${N()}s`,n||(n=setInterval(()=>{k()?T.textContent=`COOLING OFF — ${N()}s`:(clearInterval(n),n=null,L.classList.add("hidden"),o.disabled=!1,b(),window.dispatchEvent(new Event("voyanabet:open-chart")))},Q)),!0):(L.classList.add("hidden"),o.disabled=l,n&&(clearInterval(n),n=null),!1)}function J(t){const r=t.querySelector(".reel-symbol");let s=0,f=null;return{start(){t.classList.add("spinning"),f=setInterval(()=>{s=(s+1)%D.length;const u=D[s];r.textContent=E[u],r.style.color=I[u]},z)},stop(u){clearInterval(f),t.classList.remove("spinning"),r.textContent=E[u],r.style.color=I[u],t.classList.add("landed"),setTimeout(()=>t.classList.remove("landed"),500)}}}o.addEventListener("click",async()=>{var u;if(l||$())return;if(F()<e){v(`Need ${e} chips`,"loss");return}l=!0,o.disabled=!0,d.textContent="SPINNING…",S.classList.add("hidden"),p.disabled=y.disabled=!0,B(-e);const t=_.map(J);t.forEach(c=>c.start());const r=Date.now(),s=await V(e);if(!s){B(e),t.forEach(c=>c.stop("Bar")),l=!1,o.disabled=!1,d.textContent="SPIN",p.disabled=y.disabled=!1,v("Server offline — start Flask to spin","loss");return}await w(Math.max(0,600-(Date.now()-r))),t[0].stop(s.reels[0]),await w(600),t[1].stop(s.reels[1]),await w(600),t[2].stop(s.reels[2]),s.payout>0&&B(s.payout),Y(e,s.payout);const f=k();f&&(K({lockedAt:Date.now(),reason:"loss_threshold"}),window.dispatchEvent(new Event("voyanabet:open-chart"))),U({game:"slots",bet:e,payout:s.payout,outcome:s.outcome,timestamp:Date.now()}),x(),s.outcome==="LOSS"?v("No match","loss"):s.outcome.includes("JACKPOT_3X")?((u=document.querySelector(".slots-screen"))==null||u.classList.add("jackpot-burst"),setTimeout(()=>{var c;return(c=document.querySelector(".slots-screen"))==null?void 0:c.classList.remove("jackpot-burst")},2e3),v(`✦ JACKPOT! +${s.payout}`,"jackpot")):(_.forEach((c,G)=>{const h=s.reels;(h.every(g=>g===h[0])||h.filter(g=>g===h[G]).length>=2)&&(c.classList.add("win-glow"),setTimeout(()=>c.classList.remove("win-glow"),1600))}),v(`${s.outcome.replace("_"," ")} +${s.payout}`,"win")),l=!1,d.textContent="SPIN",f||(o.disabled=!1),b()});function v(t,r){M.textContent=t,S.className=`result-banner result-${r}`}b(),$(),new MutationObserver(()=>{document.getElementById("slots-spin-btn")||(n&&clearInterval(n),a==null||a())}).observe(document.getElementById("game-view")??document.body,{childList:!0})}export{tt as render};
