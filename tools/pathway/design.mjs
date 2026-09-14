import {referenceDefaults,resolvePVCModuli,validateReference} from './material-reference.mjs';
import {sectionGeometry,ribKeys} from './section.mjs';
export const clone=v=>structuredClone(v);
export const materialDefaults={youngMPa:null,flexuralMPa:null,tensileStrengthMPa:null,flexuralStrengthMPa:null,bendingBasis:'auto',poisson:.38,sample:'',temperature:null,notes:'',reference:structuredClone(referenceDefaults)};
export function validateMaterial(m,s={material:m}){
  if(!m||typeof m!=='object'||Array.isArray(m))return 'Check the material measurement record.';
  for(const k of ['youngMPa','flexuralMPa','tensileStrengthMPa','flexuralStrengthMPa'])if(m[k]!==null&&(!Number.isFinite(m[k])||m[k]<=0||m[k]>1e7))return 'Material measurements must be positive MPa values up to 10,000,000, or left blank.';
  if(!['auto','young','flexural'].includes(m.bendingBasis))return 'Choose the bending modulus source.';
  if(m.reference!==undefined){const error=validateReference(m.reference);if(error)return error;}
  if(m.bendingBasis==='young'&&resolvePVCModuli(s).E===null||m.bendingBasis==='flexural'&&m.flexuralMPa===null)return 'Enter the selected bending modulus or choose Automatic.';
  if(!Number.isFinite(m.poisson)||m.poisson<=-1||m.poisson>=.5)return 'Poisson’s ratio must be greater than −1 and less than 0.5.';
  if(m.temperature!==null&&(!Number.isFinite(m.temperature)||m.temperature< -273.15||m.temperature>1000))return 'Check the measurement temperature.';
  for(const k of ['sample','notes'])if(typeof m[k]!=='string'||m[k].length>1000)return 'Measurement notes must be text of at most 1,000 characters.';
  return null;
}
export function materialBasis(s){
  const m=s.material||materialDefaults;
  const resolved=resolvePVCModuli(s);
  return {...resolved,G:resolved.GbaseMPa===null?null:resolved.GbaseMPa/(2*(1+m.poisson)),poisson:m.poisson,modulusDifferencePercent:m.youngMPa&&m.flexuralMPa?(m.flexuralMPa/m.youngMPa-1)*100:null};
}
export function rigidity(s){
  if(s.calibration)return{...calibrationValues(s.calibration),Bwh:0,physical:true,source:'Measured whole-profile calibration',coupling:'Independent-axis approximation; bending coupling is not measured.'};
  const g=sectionGeometry(s),m=materialBasis(s);
  if(s.steel?.enabled){const available=m.E!==null;return {...(available?g.composite:g.pvcMoments),C:0,physical:available,bendingOnly:true,source:available?(s.steel.fit==='bonded'?'No-slip composite bending':'Sliding-fit assembled bending'):'PVC-only geometric bending; steel stiffness unavailable',note:g.torsionNote};}
  return m.E===null?{Bw:g.Bw,Bh:g.Bh,Bwh:g.Bwh,C:g.C,physical:false,source:'Geometric section ratios'}:{Bw:m.E*g.Bw,Bh:m.E*g.Bh,Bwh:m.E*g.Bwh,C:m.G*g.J,physical:true,source:m.bendingSource+' × selected section geometry'};
}
export function materialAssessment(s,strain){
  const m=s.material||materialDefaults,basis=materialBasis(s),stress=basis.E===null?null:basis.E*strain;
  return {...basis,nominalBendingStressMPa:stress,stressBasis:stress===null?null:basis.bendingSource+' × peak geometric bending strain',routeStiffnessSource:rigidity(s).source,comparisons:[['tensileStrengthMPa','Tensile strength'],['flexuralStrengthMPa','Flexural strength']].filter(([k])=>m[k]!==null).map(([k,label])=>({property:k,label,recordedMPa:m[k],ratio:stress===null?null:stress/m[k],status:stress===null?'needs_modulus':stress>=m[k]?'at_or_above_recorded_strength':'below_recorded_strength'})),note:'Nominal linear-elastic bending-stress screening only. Recorded strengths are test results, not allowable stresses. Ratios exclude compression failure, torsional stress, pushing, buckling, local wall effects and safety factors. Whole-profile calibration is not converted into a material modulus.'};
}
export function calibrationValues(c){
  const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
  for(const key of ['width','height'])if(!c?.[key]||!['span','force','deflection'].every(k=>positive(c[key][k])))throw Error('Enter positive span, added load and additional deflection for both bending tests.');
  if(!c?.torsion||!['span','torque','angle'].every(k=>positive(c.torsion[k])))throw Error('Enter positive gauge length, torque and additional twist.');
  const bend=q=>q.force*q.span**3/(48*q.deflection),v={Bw:bend(c.width),Bh:bend(c.height),C:c.torsion.torque*1000*c.torsion.span/(c.torsion.angle*Math.PI/180)};
  if(!Object.values(v).every(positive))throw Error('Calibration values are outside the supported numeric range.');
  return v;
}
export function signature(s){return JSON.stringify([s.width,s.height,s.section||'solid',s.wall||1,...(s.section==='ribbed'?ribKeys.map(k=>s.ribbed?.[k]):[]),...(s.steel?.enabled?[{fit:s.steel.fit,inserts:s.steel.inserts}]:[])]);}
export function sectionProperties(s){
  const {area,Bw,Bh,Bwh,C,J,Ixx,Iyy,Ixy}=sectionGeometry(s);
  return {area,Bw,Bh,Bwh,C,J,Ixx,Iyy,Ixy};
}
export class History{
  constructor(s){this.items=[clone(s)];this.index=0;}
  push(s){if(JSON.stringify(this.items[this.index])===JSON.stringify(s))return;this.items.splice(this.index+1);this.items.push(clone(s));if(this.items.length>80)this.items.shift();this.index=this.items.length-1;}
  undo(){if(this.index>0)return clone(this.items[--this.index]);}
  redo(){if(this.index<this.items.length-1)return clone(this.items[++this.index]);}
}
