'use strict';
(function(){
  let ready=false,storyState='nolev';
  function story(){
    const b=basins.get(118),toe=b['toe_'+storyState],lead=b['lead_'+storyState];
    const events=[{title:'Detectable change · ToE',date:toe,color:C[storyState]},{title:'Record exceedance · RET',date:b.ret,color:C.ink}].sort((a,b)=>a.date-b.date);
    $('storyEvents').innerHTML=events.map((v,i)=>`${i?'<span class="event-arrow" aria-hidden="true">→</span>':''}<div class="story-event" style="border-color:${v.color}"><span>${v.title}</span><strong>${v.date}</strong><small>Window ${v.date}–${v.date+9}</small></div>`).join('');
    $('storyExplanation').textContent=lead>=0?`Without levees, the detectable signal begins ${lead} years before the protected-system record-exceedance window. Lead time: ${b.ret} − ${toe} = +${lead} years.`:`With levees, the detectable signal begins ${-lead} years after the record-exceedance window. Lead time: ${b.ret} − ${toe} = ${lead} years. The shared RET has not changed; detection comes later.`;
    document.querySelectorAll('[data-story-state]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.storyState===storyState)));
  }
  function init(){if(ready)return;ready=true;
    const h=exposure.periods.historical;$('storyReduction').textContent=`${Math.round(100*(h.nolev-h.wtlev)/h.nolev)}%`;$('storyMasked').textContent=`${study.summary.masked} / ${study.summary.basin_count}`;$('storyLead').textContent=`${study.summary.nolev.median_lead} → ${study.summary.wtlev.median_lead} yr`;
    document.querySelectorAll('[data-story-state]').forEach(b=>b.addEventListener('click',()=>{storyState=b.dataset.storyState;story();}));
    story();
  }
  window.addEventListener('research-ready',init);if(document.documentElement.dataset.researchReady==='true')init();
})();
