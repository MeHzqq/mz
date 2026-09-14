import {signature} from './design.mjs';
const removedKeys=['edgeStyle','leftHeight','rightHeight','edgeWidth','edgeThickness'];
const oldRibKeys=['base','count','pitch','web','capWidth','capThickness',...removedKeys];
// Preserve surviving dimensions and only re-sign a demonstrably unchanged section.
export function migrateEdgeLips(s){
 const r=s.ribbed;if(!r||typeof r!=='object'||Array.isArray(r)||!removedKeys.some(k=>Object.hasOwn(r,k)))return;
 const oldSignature=JSON.stringify([s.width,s.height,s.section||'solid',s.wall||1,...(s.section==='ribbed'?oldRibKeys.map(k=>r[k]):[]),...(s.steel?.enabled?[{fit:s.steel.fit,inserts:s.steel.inserts}]:[])]);
 const removed=Object.fromEntries(removedKeys.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]]));
 for(const k of removedKeys)delete r[k];
 if(s.section!=='ribbed')return;
 const sameSection=removed.edgeStyle==='none'&&s.calibration?.signature===oldSignature;
 let previousCalibration=null;
 if(s.calibration){if(sameSection)s.calibration.signature=signature(s);else{previousCalibration=structuredClone(s.calibration);s.calibration=null;}}
 s.sectionMigration={removedEdgeSettings:removed,previousCalibration,
  notice:'Previous edge-lip settings were removed. The section now uses the base and T-ribs only.'+(previousCalibration?' The previous sample calibration is kept inactive because its section has changed or could not be verified. Recalibrate the current section.':sameSection?' The matching calibration for a section without lips was retained.':'')};
}
