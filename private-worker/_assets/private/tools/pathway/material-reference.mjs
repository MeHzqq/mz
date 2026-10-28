// Public material reference, separate from recorded specimen measurements.
export const referenceDefaults={mode:'auto',valueMPa:2758};
const ex=['56-7EX','85-7EX','85-8EX','126-15EX','126-20EX','126-30EX','85-7EXS','85-9EXS','126-12EXS','126-14EXS'];
const ro=['91-21RO','91-22ROS','91-32ROS','91-37RO'];
export const referenceSources={
 classification:{title:'Public specification · ASTM D1784 classification table 1',url:'https://www.nlma.gov.tw/uploads/files/5dd4e844bb274ebf998906cc68544c9a.pdf',location:'Section 02538, page 02538-12, Table 1'},
 EX:{title:'SEKISUI Expanda brochure · material class and profiles',url:'https://cdn.craft.cloud/6c695be5-e292-47e8-aaac-e5b368d7a623/assets/uploads/EX-Product-Brochures_250916-no-border.pdf#page=5',location:'Revision 2508, page 5'},
 RO:{title:'SEKISUI Rotaloc · current material classification',url:'https://www.sekisuiribloc.com/spr-ro-rotaloc',location:'Proven pipe material'},
 ROprofiles:{title:'SEKISUI Rotaloc brochure · named profile mapping',url:'https://cdn.craft.cloud/6c695be5-e292-47e8-aaac-e5b368d7a623/assets/uploads/RO-Product-Brochure_241118-no-border.pdf#page=5',location:'Revision 2411, page 5'},
 scope:{title:'ASTM D1784 · compound classification scope',url:'https://store.astm.org/d1784-20.html',location:'Scope 1.3'}
};
export function materialReference(s){
 const settings=s.material?.reference??referenceDefaults,family=s.section==='ribbed'?(ex.includes(s.profilePreset)?'EX':ro.includes(s.profilePreset)?'RO':null):null;
 const eligible=family!==null,available=eligible&&settings.mode!=='off';
 return {id:'astm-d1784-13354',materialClass:'13354',referenceMinimumMPa:2758,valueMPa:settings.valueMPa,mode:settings.mode,eligible,available,profile:s.profilePreset,family,
  label:settings.mode==='off'?'Reference disabled':settings.mode==='adjusted'?'User adjusted reference':'Public reference · ASTM D1784 class 13354',
  status:!eligible?'Inactive for this profile selection':settings.mode==='off'?'Disabled':'Available when the selected modulus has no recorded value',
  sources:eligible?[referenceSources.classification,referenceSources[family],...(family==='RO'?[referenceSources.ROprofiles]:[]),referenceSources.scope]:[],
  checked:'2026-09-13',note:'2,758 MPa is a class-reference minimum for tensile modulus (400,000 psi), not a measured modulus for this specimen. Using it in bending is a material assumption. It is not an allowable stress or a guarantee of conservative results. Temperature and loading-time corrections are not applied.'};
}
export const selectedBendingKey=s=>s.material?.bendingBasis==='young'?'youngMPa':s.material?.bendingBasis==='flexural'?'flexuralMPa':s.material?.flexuralMPa!=null?'flexuralMPa':'youngMPa';
export function resolvePVCModuli(s){
 const m=s.material||{},reference=materialReference(s),young=m.youngMPa??null,flexural=m.flexuralMPa??null,key=selectedBendingKey(s);
 const effectiveYoung=young??(reference.available?reference.valueMPa:null),E=key==='flexuralMPa'?flexural:effectiveYoung;
 // Prefer recorded values for the shear estimate too, before a reference fallback.
 const GbaseMPa=young??flexural??(reference.available?reference.valueMPa:null),usesReference=E!==null&&key==='youngMPa'&&young===null,usesReferenceShear=GbaseMPa!==null&&young===null&&flexural===null;
 const referenceOrigin=reference.mode==='adjusted'?'adjusted':'reference';
 return {E,effectiveYoung,GbaseMPa,bendingKey:key,bendingOrigin:E===null?'none':usesReference?referenceOrigin:'recorded',shearOrigin:GbaseMPa===null?'none':usesReferenceShear?referenceOrigin:'recorded',
  bendingSource:E===null?null:key==='flexuralMPa'?'Flexural modulus':usesReference?'Young’s modulus ('+(reference.mode==='adjusted'?'user adjusted reference':'public reference')+')':'Young’s modulus',
  shearSource:GbaseMPa===null?null:young!==null?'Recorded Young’s modulus with isotropic assumption':flexural!==null?'Flexural modulus proxy with isotropic assumption':'Reference Young’s modulus with isotropic assumption',
  reference:{...reference,usedForBending:usesReference,usedForShear:usesReferenceShear}};
}
export const pvcModulus=s=>resolvePVCModuli(s).E;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function referenceWorkingHTML(s){
 const {reference:r}=resolvePVCModuli(s);
 const use=r.usedForBending?'Used for nominal PVC stress'+(s.calibration?'; whole-profile calibration controls route stiffness.':' and calculated bending stiffness.'):r.available?'Recorded moduli take precedence for automatic bending.':r.status+'.';
 return '<div class="reference-evidence"><strong>'+esc(r.label)+'</strong><p>'+esc(r.eligible?'PVC class 13354 reference for '+r.profile+'. '+use:'No documented class 13354 reference is assigned to this profile selection. Recorded measurements remain available.')+'</p>'+(r.eligible?'<p>Reference input: '+esc(Number.isFinite(r.valueMPa)?r.valueMPa:'Enter a valid value')+' MPa. Published class minimum: 2,758 MPa. '+esc(r.mode==='off'?'This stored input is inactive.':r.mode==='adjusted'?'The entered reference has been adjusted by the user.':'This is a reference minimum, not a specimen measurement.')+'</p><details class="reference-sources"><summary>Reference sources and scope</summary><ul>'+r.sources.map(x=>'<li><a href="'+esc(x.url)+'" target="_blank" rel="noreferrer">'+esc(x.title)+'</a> · '+esc(x.location)+'</li>').join('')+'</ul><p>'+esc(r.note)+'</p><p>Public sources checked '+r.checked+'.</p></details>':'')+'</div>';
}
export function validateReference(r){
 if(!r||typeof r!=='object'||Array.isArray(r)||!['auto','adjusted','off'].includes(r.mode))return 'Choose a valid PVC reference mode.';
 if(!Number.isFinite(r.valueMPa)||r.valueMPa<=0||r.valueMPa>1e7)return 'Reference modulus must be a positive MPa value up to 10,000,000.';
 if(r.mode==='auto'&&r.valueMPa!==2758)return 'The public reference is 2,758 MPa. Use User adjusted for another value.';
 return null;
}
