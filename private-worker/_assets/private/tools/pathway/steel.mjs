import {pvcModulus} from './material-reference.mjs';
export {pvcModulus,selectedBendingKey} from './material-reference.mjs';
export const steelDefaults={enabled:false,fit:'sliding',youngMPa:200000,inserts:[]};
export const reinforcedProfiles=['91-22ROS','91-32ROS'];
export const supportsSteel=s=>s.section==='ribbed'&&reinforcedProfiles.includes(s.profilePreset);
export function teeRectangles(s,index){const r=s.ribbed,x=s.width/2+(index-(r.count-1)/2)*r.pitch;return [[x-r.web/2,r.base,x+r.web/2,s.height-r.capThickness],[x-r.capWidth/2,s.height-r.capThickness,x+r.capWidth/2,s.height]];}
// Each T is a web and cap with no overlap; test the full insert area, not just its corners.
export function teeForInsert(s,item){
 if(!supportsSteel(s)||!s.ribbed||!Number.isInteger(s.ribbed.count)||s.ribbed.count<1||s.ribbed.count>10)return -1;
 const eps=1e-6,r=steelRectangle(item),q=[r[0]-eps,r[1]-eps,r[2]+eps,r[3]+eps],area=(q[2]-q[0])*(q[3]-q[1]);
 for(let i=0;i<s.ribbed.count;i++){const covered=teeRectangles(s,i).reduce((n,c)=>n+Math.max(0,Math.min(q[2],c[2])-Math.max(q[0],c[0]))*Math.max(0,Math.min(q[3],c[3])-Math.max(q[1],c[1])),0);if(area-covered<=1e-10*Math.max(1,area))return i;}
 return -1;
}
export const steelRectangle=i=>[i.x-i.width/2,i.y-i.height/2,i.x+i.width/2,i.y+i.height/2];
export const steelGeometryEdit=(s,obj,key)=>obj===s.steel?['enabled','fit','inserts'].includes(key):(s.steel?.inserts||[]).includes(obj);
export function defaultSteelInsert(s){
 if(!supportsSteel(s)||!s.ribbed||!Number.isInteger(s.ribbed.count)||s.ribbed.count<1||s.ribbed.count>10)return null;
 const r=s.ribbed,span=s.height-r.capThickness-r.base;
 if(!Number.isFinite(span)||span<=.0001||!Number.isFinite(r.web)||r.web<=.0001)return null;
 for(let index=0;index<r.count;index++){
  if((s.steel?.inserts||[]).some(p=>teeForInsert(s,p)===index))continue;
  const item={x:s.width/2+(index-(r.count-1)/2)*r.pitch,y:r.base+span/2,width:Math.min(.5,r.web*.4),height:span*.7};
  if(teeForInsert(s,item)===index)return item;
 }
 return null;
}
export function validateSteel(s){
 if(s.profileFlipped!==undefined&&typeof s.profileFlipped!=='boolean')return 'Check the profile flip setting.';
 const a=s.steel;if(a===undefined)return null;
 if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.enabled!=='boolean')return 'Check steel reinforcement settings.';
 if(a.enabled&&!supportsSteel(s))return 'Encapsulated steel is available only for the 91-22ROS and 91-32ROS ribbed profiles.';
 if(!['sliding','bonded'].includes(a.fit))return 'Choose sliding or no-slip steel fit.';
 if(!Number.isFinite(a.youngMPa)||a.youngMPa<=0||a.youngMPa>1e7)return 'Enter a positive steel modulus in MPa.';
 if(!Array.isArray(a.inserts)||a.inserts.length>6)return 'Use at most six rectangular steel inserts.';
 for(const i of a.inserts)if(!i||!['x','y','width','height'].every(k=>Number.isFinite(i[k]))||i.width<=0||i.height<=0||i.width>150||i.height>50||Math.abs(i.x)>150||Math.abs(i.y)>50)return 'Check steel insert sizes and positions.';
 if(a.enabled&&!a.inserts.length)return 'Add a steel insert or turn reinforcement off.';
 if(a.enabled&&a.fit==='bonded'&&pvcModulus(s)===null)return 'For no-slip composite bending, enter a PVC Young’s or flexural modulus in Material, or choose Sliding fit.';
 return null;
}
export function flipProfile(s){const next=structuredClone(s);next.profileFlipped=!next.profileFlipped;return next;}
// Every component follows the same curvature. Sliding components carry zero net axial force individually.
export function compositeBending(parts,fit='bonded'){
 const EA=parts.reduce((n,p)=>n+p.E*p.area,0),centroid=[0,1].map(k=>parts.reduce((n,p)=>n+p.E*p.area*p.centroid[k],0)/EA);
 let Bw=0,Bh=0,Bwh=0;
 for(const p of parts){const dx=fit==='bonded'?p.centroid[0]-centroid[0]:0,dy=fit==='bonded'?p.centroid[1]-centroid[1]:0;Bw+=p.E*(p.Iyy+p.area*dx*dx);Bh+=p.E*(p.Ixx+p.area*dy*dy);Bwh+=p.E*(p.Ixy+p.area*dx*dy);}
 return {Bw,Bh,Bwh,centroid,EA};
}
export function rectangleProperties([x0,y0,x1,y1]){const w=x1-x0,h=y1-y0;return{area:w*h,centroid:[(x0+x1)/2,(y0+y1)/2],Ixx:w*h**3/12,Iyy:h*w**3/12,Ixy:0};}
