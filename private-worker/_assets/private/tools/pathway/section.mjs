import {supportsSteel,teeForInsert,steelRectangle,validateSteel,pvcModulus,compositeBending,rectangleProperties,steelGeometryEdit} from './steel.mjs';
// Public-reference presets supply only the dimensions explicitly tabulated by the source.
const brochureRoot='https://cdn.craft.cloud/6c695be5-e292-47e8-aaac-e5b368d7a623/assets/uploads/';
export const profileSources={
 EX:{title:'SEKISUI Rib Loc · SPR EX / Expanda brochure',url:brochureRoot+'EX-Product-Brochures_250916-no-border.pdf',page:5,revision:'2508',family:'Expanda'},
 RO:{title:'SEKISUI Rib Loc · SPR RO / Rotaloc brochure',url:brochureRoot+'RO-Product-Brochures_250916-no-border.pdf',page:5,revision:'2508',family:'Rotaloc'}
};
export const profilePresets=[
 ...[['56-7EX',7],['85-7EX',7],['85-8EX',8],['126-15EX',15],['126-20EX',20],['126-30EX',30],['85-7EXS',7.2],['85-9EXS',9.6],['126-12EXS',11.3],['126-14EXS',14.5]].map(([id,height])=>({id,height,source:'EX'})),
 ...[['91-21RO',20],['91-37RO',38],['91-22ROS',22],['91-32ROS',32]].map(([id,height])=>({id,height,source:'RO'}))
];
export const ribKeys=['base','count','pitch','web','capWidth','capThickness'];
export const isSectionEdit=(s,obj,key)=>obj===s?['width','height','wall','section'].includes(key):(obj===s.ribbed&&ribKeys.includes(key))||steelGeometryEdit(s,obj,key);
export function defaultRibs(width,height){
 const w=width,h=height,count=Math.max(1,Math.min(5,Math.floor(w/20))),sideMargin=Math.min(4,w*.07)+w*.05,capWidth=Math.min(6,w*.15),round=n=>Math.round(n*1000)/1000;
 return Object.fromEntries(Object.entries({base:Math.min(1.5,h*.16),count,pitch:count>1?(w-2*sideMargin-capWidth)/(count-1):w/2,web:Math.min(1.3,capWidth*.3,h*.12),capWidth,capThickness:Math.min(1.2,h*.15)}).map(([k,v])=>[k,typeof v==='number'?round(v):v]));
}
export function applyProfilePreset(state,id){
 const preset=profilePresets.find(p=>p.id===id);if(!preset)throw Error('Choose a public profile reference.');
 const next=structuredClone(state);next.section='ribbed';next.profilePreset=id;next.height=preset.height;
 next.ribbed=defaultRibs(next.width,next.height,preset.source);if(next.steel?.enabled){if(next.calibration)next.steel.inactiveCalibration=next.calibration;next.steel.enabled=false;}next.calibration=null;return next;
}
export function validateSection(s){
 const steelError=validateSteel(s);if(steelError)return steelError;
 if(s.profilePreset!==undefined&&s.profilePreset!=='custom'&&!profilePresets.some(p=>p.id===s.profilePreset))return 'Choose a recognised public reference or Custom.';
 if(s.section!=='ribbed')return null;
 const r=s.ribbed;if(!r||typeof r!=='object'||Array.isArray(r))return 'Enter the ribbed section dimensions.';
 for(const k of ribKeys)if(!Number.isFinite(r[k])||r[k]<=0||r[k]>150)return 'Rib dimensions must be positive numbers up to 150 mm.';
 if(!Number.isInteger(r.count)||r.count<1||r.count>10)return 'Use a whole number from 1 to 10 for the rib count.';
 if(['edgeStyle','leftHeight','rightHeight','edgeWidth','edgeThickness'].some(k=>Object.hasOwn(r,k)))return 'This saved section needs migration. Load it to remove obsolete edge-lip settings.';
 if(r.base+r.capThickness>=s.height)return 'Base and cap thickness together must be less than the section height.';
 if(r.web>r.capWidth)return 'Rib thickness must not exceed the cap width.';
 if(r.count>1&&r.pitch<=r.capWidth)return 'Rib spacing must be greater than the cap width so the section stays open.';
 const halfSpan=((r.count-1)*r.pitch+r.capWidth)/2,sideGap=s.width/2-halfSpan;
 if(sideGap<=0)return 'The ribs and caps must fit inside the section width. Reduce count, spacing or cap width.';

 return null;
}
const rectangle=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
export function ribRectangles(s){
 const r=s.ribbed,w=s.width,h=s.height,rects=[[0,0,w,r.base]];
 for(let i=0;i<r.count;i++){
  const x=w/2+(i-(r.count-1)/2)*r.pitch;
  rects.push([x-r.web/2,r.base,x+r.web/2,h-r.capThickness],[x-r.capWidth/2,h-r.capThickness,x+r.capWidth/2,h]);
 }

 return rects;
}
// Exact area union on the rectangle-edge grid: shared junctions are counted once.
export function rectangleUnion(rects,cutouts=[]){
 const xs=[...new Set([...rects,...cutouts].flatMap(r=>[r[0],r[2]]))].sort((a,b)=>a-b),ys=[...new Set([...rects,...cutouts].flatMap(r=>[r[1],r[3]]))].sort((a,b)=>a-b);
 const inside=(r,i,j)=>(xs[i]+xs[i+1])/2>r[0]&&(xs[i]+xs[i+1])/2<r[2]&&(ys[j]+ys[j+1])/2>r[1]&&(ys[j]+ys[j+1])/2<r[3];
 const filled=xs.slice(1).map((_,i)=>ys.slice(1).map((_,j)=>rects.some(r=>inside(r,i,j))&&!cutouts.some(r=>inside(r,i,j))));
 const cells=[],edges=new Map(),key=(i,j)=>i+','+j,edge=(i,j,a,b)=>edges.set(key(i,j),[a,b]);
 for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++)if(filled[i][j]){
  cells.push([xs[i],ys[j],xs[i+1],ys[j+1]]);
  if(!filled[i]?.[j-1])edge(i,j,i+1,j);
  if(!filled[i+1]?.[j])edge(i+1,j,i+1,j+1);
  if(!filled[i]?.[j+1])edge(i+1,j+1,i,j+1);
  if(!filled[i-1]?.[j])edge(i,j+1,i,j);
 }
 const loops=[];
 while(edges.size){const start=edges.keys().next().value;let k=start,loop=[];
  do{const [i,j]=k.split(',').map(Number);loop.push([xs[i],ys[j]]);const next=edges.get(k);edges.delete(k);if(!next)throw Error('Section outline is disconnected.');k=key(...next);}while(k!==start);
  loop=loop.filter((p,i)=>{const a=loop[(i+loop.length-1)%loop.length],b=loop[(i+1)%loop.length];return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-10;});loops.push(loop);
 }
 const A=cells.reduce((n,r)=>n+(r[2]-r[0])*(r[3]-r[1]),0);
 const cx=cells.reduce((n,r)=>n+(r[2]-r[0])*(r[3]-r[1])*(r[0]+r[2])/2,0)/A,cy=cells.reduce((n,r)=>n+(r[2]-r[0])*(r[3]-r[1])*(r[1]+r[3])/2,0)/A;
 let Ixx=0,Iyy=0,Ixy=0;
 for(const [x0,y0,x1,y1]of cells){const w=x1-x0,h=y1-y0,a=w*h,dx=(x0+x1)/2-cx,dy=(y0+y1)/2-cy;Ixx+=w*h**3/12+a*dy*dy;Iyy+=h*w**3/12+a*dx*dx;Ixy+=a*dx*dy;}
 return {area:A,centroid:[cx,cy],Ixx,Iyy,Ixy,loops,cells};
}
let cachedKey=null,cachedGeometry=null;
function bareGeometry(s){
 const key=JSON.stringify([s.section,s.width,s.height,s.wall,s.ribbed]);if(key===cachedKey)return cachedGeometry;
 const w=s.width,h=s.height,wall=s.wall||1;let g,J,torsionNote;
 if(s.section==='ribbed'){
  const rects=ribRectangles(s);g=rectangleUnion(rects);
  // Open-wall estimate from physical branches, never from the union's arbitrary grid cells.
  J=rects.reduce((n,r)=>{const a=Math.max(r[2]-r[0],r[3]-r[1]),t=Math.min(r[2]-r[0],r[3]-r[1]);return n+a*t**3/3;},0);
  torsionNote='Approximate open-wall torsion, J = sum(length × thickness³ / 3). Short, thick walls are outside the thin-wall assumption. Junctions, warping restraint and shear-centre coupling are omitted; use whole-profile calibration for a better effective estimate.';
 }else{
  const hollow=s.section==='hollow',wi=hollow?w-2*wall:0,hi=hollow?h-2*wall:0;
  g={area:w*h-wi*hi,centroid:[w/2,h/2],Ixx:(w*h**3-wi*hi**3)/12,Iyy:(h*w**3-hi*wi**3)/12,Ixy:0,loops:[rectangle(0,0,w,h),...(hollow?[rectangle(wall,wall,w-wall,h-wall).reverse()]:[])]};
  const a=Math.max(w,h),b=Math.min(w,h);J=hollow?2*wall*(w-wall)**2*(h-wall)**2/(w+h-2*wall):a*b**3*(1/3-.21*b/a*(1-b**4/(12*a**4)));
  torsionNote=hollow?'Closed thin-wall torsion approximation.':'Solid rectangular torsion approximation.';
 }
 const [cx,cy]=g.centroid,loops=g.loops.map(loop=>loop.map(([x,y])=>[x-cx,y-cy]));
 cachedKey=key;cachedGeometry={area:g.area,centroid:g.centroid,Ixx:g.Ixx,Iyy:g.Iyy,Ixy:g.Ixy,Bw:g.Iyy,Bh:g.Ixx,Bwh:g.Ixy,J,C:J/2.76,loops,vertices:loops.flat(),bounds:{minX:-cx,maxX:w-cx,minY:-cy,maxY:h-cy},torsionNote};return cachedGeometry;
}

export function pvcRectangles(s){const w=s.width,h=s.height,t=s.wall;if(s.section==='ribbed')return ribRectangles(s);if(s.section==='hollow')return[[0,0,w,t],[0,h-t,w,h],[0,t,t,h-t],[w-t,t,w,h-t]];return[[0,0,w,h]];}
export function validateSteelPlacement(s){
 if(!s.steel?.enabled)return null;
 if(!supportsSteel(s))return 'Encapsulated steel is available only for the 91-22ROS and 91-32ROS ribbed profiles.';
 const cells=rectangleUnion(pvcRectangles(s)).cells,rects=s.steel.inserts.map(steelRectangle),eps=1e-6;
 for(let i=0;i<rects.length;i++){
  if(teeForInsert(s,s.steel.inserts[i])<0)return 'Steel insert '+(i+1)+' must stay inside one T-rib (web and cap), with PVC cover. The base and spaces between ribs cannot contain steel.';
  const r=rects[i],expanded=[r[0]-eps,r[1]-eps,r[2]+eps,r[3]+eps],area=(expanded[2]-expanded[0])*(expanded[3]-expanded[1]);
  const covered=cells.reduce((n,c)=>n+Math.max(0,Math.min(c[2],expanded[2])-Math.max(c[0],expanded[0]))*Math.max(0,Math.min(c[3],expanded[3])-Math.max(c[1],expanded[1])),0);
  if(area-covered>1e-10*Math.max(1,area))return 'Steel insert '+(i+1)+' must be fully inside the PVC material, with PVC cover on every side.';
  for(let j=0;j<i;j++){const q=rects[j];if(r[0]<=q[2]+eps&&r[2]>=q[0]-eps&&r[1]<=q[3]+eps&&r[3]>=q[1]-eps)return 'Steel inserts must be separate and must not overlap or touch.';}
 }
 return null;
}
let assemblyKey=null,assemblyGeometry=null;
export function sectionGeometry(s){
 const key=JSON.stringify([s.section,s.width,s.height,s.wall,s.ribbed,s.steel,s.profileFlipped,s.steel?.enabled?pvcModulus(s):null]);if(key===assemblyKey)return assemblyGeometry;
 const base=bareGeometry(s),steel=s.steel?.enabled,sense=s.profileFlipped?-1:1,rects=steel?s.steel.inserts.map(steelRectangle):[];
 const pvc=steel?rectangleUnion(pvcRectangles(s),rects):{area:base.area,centroid:base.centroid,Ixx:base.Ixx,Iyy:base.Iyy,Ixy:base.Ixy,loops:base.loops.map(loop=>loop.map(([x,y])=>[x+base.centroid[0],y+base.centroid[1]]))};
 const E=pvcModulus(s),steelParts=rects.map(r=>({...rectangleProperties(r),E:s.steel.youngMPa,rawLoop:rectangle(...r)}));
 const bending=steel&&E!==null?compositeBending([{...pvc,E},...steelParts],s.steel.fit):null;
 const datum=steel?(s.steel.fit==='bonded'&&bending?bending.centroid:pvc.centroid):base.centroid;
 const local=([x,y])=>[sense*(x-datum[0]),sense*(y-datum[1])],loops=pvc.loops.map(loop=>loop.map(local)),materialVertices=loops.flat();
 const components=steelParts.map(p=>({...p,loop:p.rawLoop.map(local),strainVertices:p.rawLoop.map(([x,y])=>{const c=s.steel.fit==='bonded'?datum:p.centroid;return[sense*(x-c[0]),sense*(y-c[1])];})}));
 const vertices=[...materialVertices,...components.flatMap(p=>p.loop)],bounds={minX:Math.min(...vertices.map(p=>p[0])),maxX:Math.max(...vertices.map(p=>p[0])),minY:Math.min(...vertices.map(p=>p[1])),maxY:Math.max(...vertices.map(p=>p[1]))};
 const dx=base.centroid[0]-datum[0],dy=base.centroid[1]-datum[1],Ixx=base.Ixx+base.area*dy*dy,Iyy=base.Iyy+base.area*dx*dx,Ixy=base.Ixy+base.area*dx*dy;
 assemblyKey=key;assemblyGeometry={...base,area:base.area,centroid:datum,areaCentroid:base.centroid,pvcArea:pvc.area,steelArea:steelParts.reduce((n,p)=>n+p.area,0),Ixx,Iyy,Ixy,Bw:Iyy,Bh:Ixx,Bwh:Ixy,loops,vertices,bounds,pvcVertices:materialVertices,steelParts:components,composite:bending,
  pvcMoments:{Bw:pvc.Iyy,Bh:pvc.Ixx,Bwh:pvc.Ixy},flipped:!!s.profileFlipped,
  datumKind:steel?(s.steel.fit==='bonded'?'Elastic centre · no-slip assumption':'PVC centroid · sliding-fit assumption'):'Area centroid',
  J:steel?null:base.J,C:steel?0:base.C,torsionNote:steel?'Reinforced torsional rigidity is not estimated. Uncalibrated reinforced routes minimise bending only and still apply the twist limit. Whole-assembly calibration supplies effective torsion.':base.torsionNote};return assemblyGeometry;
}
export function sectionStrains(g,ka,kb){return{pvc:peakSectionStrain({vertices:g.pvcVertices},ka,kb),steel:g.steelParts.length?Math.max(...g.steelParts.map(p=>peakSectionStrain({vertices:p.strainVertices},ka,kb))):null,fold:peakSectionStrain(g,ka,kb)};}

export function envelopeLoop(g,gap=0){const b=g.bounds;return rectangle(b.minX-gap,b.minY-gap,b.maxX+gap,b.maxY+gap);}
export const sectionPoint=(q,[x,y])=>q.p.map((v,i)=>v+q.a[i]*x+q.b[i]*y);
export function peakSectionStrain(g,ka,kb){let peak=0;for(const [x,y]of g.vertices)peak=Math.max(peak,Math.abs(ka*x+kb*y));return peak;}
export function sectionRecord(s){
 const g=sectionGeometry(s),preset=s.section==='ribbed'?profilePresets.find(p=>p.id===s.profilePreset):null,source=preset?profileSources[preset.source]:null;
 return {model:s.section,reference:preset?{profile:preset.id,publishedHeight_mm:preset.height,source:{...source},heightMatchesPublished:Math.abs(s.height-preset.height)<1e-8}:null,
  geometryConfidence:s.section==='ribbed'?'Simplified adjustable approximation; not manufacturer CAD or a dimensionally verified product section.':'Idealised section from entered dimensions.',
  dimensionBasis:s.section==='ribbed'?{height:preset&&Math.abs(s.height-preset.height)<1e-8?'Matches the publicly tabulated height':'User-selected height',width:'User-selected; not established by the reference brochure',ribs:'Adjustable assumptions; rib layout is not manufacturer geometry'}:{width:'User-entered',height:'User-entered',wall:s.section==='hollow'?'User-entered':null},
  reinforcementScope:{profiles:['91-22ROS','91-32ROS'],placement:'Inside individual T-ribs only',basis:'Product applicability and T-rib location supplied by the user; insert dimensions remain adjustable assumptions.'},
  materialScope:s.steel?.enabled?'PVC with explicit encapsulated steel inserts in the T-ribs of 91-22ROS or 91-32ROS. Displaced PVC is subtracted. Insert dimensions and steel modulus are user assumptions, not manufacturer data.':'Single homogeneous material. Reinforcement is not generated by a product name; published liner stiffness is not used as feed-strip calibration.',
  steel:s.steel?.enabled?{fit:s.steel.fit,youngMPa:s.steel.youngMPa,inserts:s.steel.inserts,teeNumbers:s.steel.inserts.map(p=>teeForInsert(s,p)+1),area_mm2:g.steelArea,pvcArea_mm2:g.pvcArea,stiffnessAvailable:pvcModulus(s)!==null,outlineLoopsFromDatum_mm:g.steelParts.map(p=>p.loop)}:null,
  orientation:{flipped180:!!s.profileFlipped,transform:s.profileFlipped?'Physical 180-degree turnover: local x and y both reversed':'Original section orientation'},
  pathDatum:g.datumKind+'; local +x is the width axis and +y is the height axis. Insert positions are measured from the unflipped PVC lower-left corner. Profile flip rotates the whole assembly about this path datum.',
  centroidFromLowerLeft_mm:g.centroid,geometricAreaCentroidFromLowerLeft_mm:g.areaCentroid,boundsFromCentroid_mm:g.bounds,outlineLoopsFromCentroid_mm:g.loops,
  properties:{area_mm2:g.area,Ixx_mm4:g.Ixx,Iyy_mm4:g.Iyy,Ixy_mm4:g.Ixy,J_estimate_mm4:g.J},
  stiffnessConfidence:s.calibration?'Measured effective rigidities with an independent-axis approximation; bending coupling is not measured.':s.steel?.enabled?(pvcModulus(s)===null?'PVC modulus missing: route uses PVC-only geometric bending; steel stiffness is not assessed.':s.steel.fit==='bonded'?'No-slip composite bending; perfect load transfer is assumed.':'Separate beams sharing curvature, with free longitudinal slip. Friction and load transfer are not modelled.'):'Bending from entered geometry; torsion is approximate.',torsionNote:g.torsionNote,
  clearanceBasis:'Conservative outer rectangular envelope about the selected pathway datum. Spaces between ribs are not treated as available clearance.'};
}
const fmt=(n,d=2)=>Number.isFinite(n)?Number(n.toFixed(d)).toString():'—';
export function sectionSVG(s){
 const g=sectionGeometry(s),b=g.bounds,w=b.maxX-b.minX,h=b.maxY-b.minY,scale=Math.min(290/w,90/h),ox=35,oy=130,
  point=([x,y])=>[ox+(x-b.minX)*scale,oy-(y-b.minY)*scale],path=loops=>loops.map(loop=>loop.map((p,i)=>(i?'L':'M')+point(p).join(',')).join(' ')+'Z').join(' '),[cx,cy]=point([0,0]);
 return '<svg viewBox="0 0 365 215" role="img" aria-label="Cross-section '+fmt(w)+' by '+fmt(h)+' millimetres, '+(g.flipped?'flipped 180 degrees':'original orientation')+', '+(g.steelParts.length?'with encapsulated steel':'PVC only')+'"><rect width="365" height="215" rx="8" fill="#102333"/><path d="'+path(g.loops)+'" fill="#76d9cc" stroke="#d5fff6" stroke-width="1" fill-rule="evenodd"/>'+g.steelParts.map(p=>'<path d="'+path([p.loop])+'" fill="#e0b276" stroke="#ffe3af" stroke-width="1"/>').join('')+'<path d="M'+(cx-7)+' '+cy+'h14M'+cx+' '+(cy-7)+'v14" stroke="#fff" stroke-width="1.5"/><circle cx="'+cx+'" cy="'+cy+'" r="2" fill="#fff"/><g fill="#c3d6e0" font-family="system-ui,sans-serif" font-size="20"><text x="35" y="23">'+(g.flipped?'Flipped 180°'+(s.section==='ribbed'?' · ribs ↓':''):'Original orientation'+(s.section==='ribbed'?' · ribs ↑':''))+'</text><text x="35" y="156">'+fmt(w)+' mm wide · '+fmt(h)+' mm high</text><text x="35" y="181">White cross: pathway datum</text><text x="35" y="204" fill="#e0b276">'+(g.steelParts.length?'Teal: PVC · gold: steel':'Teal: PVC')+'</text></g></svg>';
}
