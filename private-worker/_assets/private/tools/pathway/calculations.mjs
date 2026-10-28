import {referenceWorkingHTML} from './material-reference.mjs';
import {sectionGeometry,sectionStrains,sectionRecord} from './section.mjs';
import {materialBasis,rigidity} from './design.mjs';
import {dot} from './solver.mjs';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formatMath=n=>n==null?'Unavailable':!Number.isFinite(n)?'Unavailable':n===0?'0':Math.abs(n)<.0001||Math.abs(n)>=1e7?n.toExponential(5):Number(n.toPrecision(7)).toLocaleString('en-AU',{maximumSignificantDigits:7});
const f=formatMath,vec=v=>'['+v.map(f).join(', ')+']',eq=(formula,working='')=>'<div class="math-equation">'+esc(formula)+(working?'<span class="math-working">'+esc(working)+'</span>':'')+'</div>';
const table=(heads,rows)=>'<div class="math-table-scroll" tabindex="0"><table><thead><tr>'+heads.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const detail=(id,title,body,open=false)=>'<details class="math-detail" data-math-section="'+id+'" '+(open?'open':'')+'><summary>'+esc(title)+'</summary>'+body+'</details>';
const paragraph=s=>'<p>'+esc(s)+'</p>';
const peak=(vertices,ka,kb)=>vertices.reduce((best,p)=>{const signed=ka*p[0]+kb*p[1],strain=Math.abs(signed);return strain>best.strain?{point:p,strain,signed}:best;},{point:vertices[0],strain:0,signed:0});

export function stationWorking(r,q){
 if(!r?.samples||!q)return null;
 const g=sectionGeometry(r.input),B=r.rigidity||rigidity(r.input),E=materialBasis(r.input).E,ka=dot(q.kv,q.a),kb=dot(q.kv,q.b),omega=q.twist*Math.PI/(180*100),strains=sectionStrains(g,ka,kb),pvc=peak(g.pvcVertices,ka,kb);
 const steel=g.steelParts.map((part,i)=>({insert:i+1,...peak(part.strainVertices,ka,kb),E:part.E}));
 const terms={width:B.Bw*ka*ka,coupling:2*B.Bwh*ka*kb,height:B.Bh*kb*kb,twist:B.C*omega*omega};
 return {s:q.s,parameter:q.parameter??null,segment:q.segment||'curve',position:q.p,tangent:q.t,widthAxis:q.a,heightAxis:q.b,curvatureVector:q.kv,curvature:q.k,radius:q.k>1e-10?1/q.k:null,ka,kb,omega,twist:q.twist,pvc:{...pvc,E,stress:E===null?null:E*pvc.strain},steel:steel.map(p=>({...p,stress:p.E*p.strain})),strains,terms,density:Object.values(terms).reduce((a,b)=>a+b,0),physical:B.physical,roll:q.roll};
}

export function calculationRecord(r){
 if(!r?.samples?.length||!r.input)return null;
 const s=r.input,g=sectionGeometry(s),B=r.rigidity||rigidity(s),m=materialBasis(s),steel=g.steelParts;
 const pvcCentre=g.areaCentroid.map((v,k)=>(g.area*v-steel.reduce((a,p)=>a+p.area*p.centroid[k],0))/g.pvcArea);
 const parts=[{name:'PVC after steel displacement',area:g.pvcArea,centroid:pvcCentre,E:m.E,Ixx:g.pvcMoments.Bh,Iyy:g.pvcMoments.Bw,Ixy:g.pvcMoments.Bwh},...steel.map((p,i)=>({name:'Steel insert '+(i+1),area:p.area,centroid:p.centroid,E:p.E,Ixx:p.Ixx,Iyy:p.Iyy,Ixy:p.Ixy}))];
 const Iref=B.physical?7680000:2560,weighted=r.stiffnessMultiplier*r.elastic,lengthTerm=r.length/1000,penalty=1e5*r.violation,contactPenalty=1e4*(r.contactCount||0);
 const highest=(fn)=>r.samples.reduce((best,q)=>fn(q)>fn(best)?q:best,r.samples[0]);
 const checks=[['Maximum path length',r.length,s.maxLength,'mm',r.violations[0]],['Minimum bend radius',r.radius,s.minRadius,'mm',r.violations[1]],['Maximum absolute twist',r.twistMax,s.maxTwist,'° / 100 mm',r.violations[2]],['Geometric folding measure',r.foldMax,.85,'ratio',r.violations[3]],['Peak PVC bending strain',100*r.strainMax,s.maxStrain||null,'%',r.violations[4]]];
 return {status:r.refined?(r.feasible?'Refined path · within selected checks':'Refined path · checks need attention'):'Unrefined preview · not yet checked',section:g,sectionRecord:sectionRecord(s),material:m,rigidity:B,parts,Iref,objective:{elasticProxy:r.elastic,weight:r.stiffnessMultiplier,weighted,lengthTerm,violation:r.violation,penalty,contactCount:r.contactCount||0,contactPenalty,demand:r.demand,score:r.score},checks,peaks:{pvc:stationWorking(r,r.samples[r.strainIndex]),bend:stationWorking(r,r.samples[r.kindex]),twist:stationWorking(r,highest(q=>Math.abs(q.twist))),steel:s.steel.enabled?stationWorking(r,highest(q=>q.steelStrain)):null},controls:r.controls,curveLength:r.length-(s.startLead||0)-(s.endLead||0),totalLength:r.length,energy:r.physicalEnergy,bendingEnergy:r.bendingEnergy};
}

function sectionHTML(s,c){
 const g=c.section,rows=[['Total material area A',f(g.area),'mm²'],['PVC area',f(g.pvcArea),'mm²'],['Steel area',f(g.steelArea),'mm²'],['Area centroid (original section)',vec(g.areaCentroid),'mm'],['Pathway datum (original section)',vec(g.centroid),'mm'],['Ixx about pathway datum',f(g.Ixx),'mm⁴'],['Iyy about pathway datum',f(g.Iyy),'mm⁴'],['Ixy about pathway datum',f(g.Ixy),'mm⁴'],['Estimated torsion constant J',f(g.J),'mm⁴']];
 let formula=s.section==='solid'?eq('A = w h; Ixx,c = w h³ / 12; Iyy,c = h w³ / 12', 'w = '+f(s.width)+' mm; h = '+f(s.height)+' mm'):s.section==='hollow'?eq('wi = w − 2t; hi = h − 2t; A = w h − wi hi', 'w = '+f(s.width)+'; h = '+f(s.height)+'; t = '+f(s.wall)+' mm')+eq('Ixx,c = (w h³ − wi hi³) / 12; Iyy,c = (h w³ − hi wi³) / 12'):eq('A = Σ Aj; c = Σ(Aj cj) / A','Ribs and base are partitioned into non-overlapping rectangles; shared material is counted once.');
 formula+=eq('Ixx = Σ(Ixx,j + Aj Δyj²); Iyy = Σ(Iyy,j + Aj Δxj²); Ixy = Σ(Ixy,j + Aj Δxj Δyj)')+paragraph('Offsets Δx and Δy are measured from each component centre to the stated reference point. The table below is geometric, before modulus weighting. Reinforced bending uses the separate component properties in the stiffness section.');
 if(s.steel.enabled)formula+=eq('Apvc = A − Σ Asteel',f(g.area)+' − '+f(g.steelArea)+' = '+f(g.pvcArea)+' mm²');
 if(!s.steel.enabled)formula+=s.section==='ribbed'?eq('J ≈ Σ(length × thickness³ / 3)', 'Open-wall estimate = '+f(g.J)+' mm⁴'):s.section==='hollow'?eq('J ≈ 2t(w − t)²(h − t)² / (w + h − 2t)', f(g.J)+' mm⁴'):eq('J ≈ a b³ [1/3 − 0.21(b/a)(1 − b⁴/(12a⁴))]','a = larger side; b = smaller side; J = '+f(g.J)+' mm⁴');
 return formula+table(['Quantity','Current value','Unit'],rows)+paragraph(g.datumKind+'. '+(s.profileFlipped?'The complete section is turned 180°: local (x, y) becomes (−x, −y).':'The original section orientation is active.'))+paragraph(c.sectionRecord.geometryConfidence+' '+g.torsionNote);
}

function stiffnessHTML(s,c){
 const B=c.rigidity,m=c.material,unit=B.physical?'N·mm²':'relative mm⁴ geometry';let body=paragraph('Active route stiffness: '+B.source+'.')+referenceWorkingHTML(s);
 body+=table(['Input','Current value','Use'],[['PVC bending modulus E',m.E===null?'Not entered':f(m.E)+' MPa',m.bendingSource||'Physical PVC stress unavailable'],['Steel modulus Es',s.steel.enabled?f(s.steel.youngMPa)+' MPa':'Steel disabled',s.steel.enabled?'Editable steel assumption / measurement':'Unused'],['Poisson ratio ν',f(m.poisson),s.calibration||s.steel.enabled?'Unused for active route torsion':'Isotropic shear estimate']]);
 if(s.calibration){
  body+=paragraph('The complete assembly calibration overrides all calculated bending and torsion stiffness. Steel stiffness is not added again.');
  for(const [key,symbol]of [['width','Bw'],['height','Bh']]){const q=s.calibration[key];body+=eq(symbol+' = F L³ / (48 δ)',f(q.force)+' × '+f(q.span)+'³ / (48 × '+f(q.deflection)+') = '+f(B[key==='width'?'Bw':'Bh'])+' N·mm²');}
  const q=s.calibration.torsion;body+=eq('C = (1000 T) L / (θ π/180)', '(1000 × '+f(q.torque)+') × '+f(q.span)+' / ('+f(q.angle)+' × π/180) = '+f(B.C)+' N·mm²')+paragraph('T is entered in N·m; lengths and deflections are in mm; θ is entered in degrees. Bwh = 0 is the independent-axis approximation. Constituent stress still uses the selected recorded or reference moduli and selected fit; calibration alone does not identify it.');
 }else if(s.steel.enabled){
  body+=s.steel.fit==='bonded'?eq('cE = Σ(Ej Aj cj) / Σ(Ej Aj)', 'Elastic centre = '+vec(c.section.centroid)+' mm')+eq('Bw = Σ Ej(Iyy,j + Aj Δxj²); Bh = Σ Ej(Ixx,j + Aj Δyj²)')+eq('Bwh = Σ Ej(Ixy,j + Aj Δxj Δyj)')+paragraph('No slip: offsets are relative to the elastic centre; perfect load transfer is assumed.'):eq('Bw = Σ Ej Iyy,j; Bh = Σ Ej Ixx,j; Bwh = Σ Ej Ixy,j')+paragraph('Sliding fit: each body bends about its own centroid, with free axial slip and shared curvature. There are no inter-body offset-area terms.');
  if(m.E===null)body+=paragraph('PVC modulus is missing. The composite formulas cannot be evaluated: the active route uses only the remaining PVC geometric moments; steel stiffness is unassessed.');
  body+=eq('C = 0 in the route objective','Reinforced torsion is unestimated. The geometric twist limit still applies.');
 }else if(m.E!==null){body+=eq('Bw = E Iyy; Bh = E Ixx; Bwh = E Ixy',f(m.E)+' × ['+f(c.section.Iyy)+', '+f(c.section.Ixx)+', '+f(c.section.Ixy)+']')+eq('G = Ebase / [2(1 + ν)]; C = G J',f(m.GbaseMPa)+' / [2(1 + '+f(m.poisson)+')] = '+f(m.G)+' MPa; C = '+f(m.G)+' × '+f(c.section.J)+' = '+f(B.C)+' N·mm²')+paragraph(m.shearSource+'.');
 }else body+=eq('Bw = Iyy; Bh = Ixx; Bwh = Ixy; C = J / 2.76','Geometric route-shaping ratios only; 2.76 is the fixed relative-shear convention, not a measured modulus.');
 body+=table(['Active coefficient','Current value','Unit'],[['Bw · toward width',f(B.Bw),unit],['Bh · toward height',f(B.Bh),unit],['Bwh · bending coupling',f(B.Bwh),unit],['C · twisting',f(B.C),unit]]);
 if(s.steel.enabled)body+=table(['Component','Area mm²','Centre x, y mm','E MPa','Ixx,c mm⁴','Iyy,c mm⁴','Ixy,c mm⁴'],c.parts.map(p=>[p.name,f(p.area),vec(p.centroid),f(p.E),f(p.Ixx),f(p.Iyy),f(p.Ixy)]))+paragraph('Component centres use the unflipped PVC lower-left origin. The moments in this component table are about each component’s own centre.');
 return body;
}

function pathHTML(r,c){
 const s=r.input,curves=r.samples.filter(q=>q.segment!=='inlet'&&q.segment!=='outlet'),turn=curves.at(-1).roll;
 return eq('r(t) = Σᵢ₌₀⁷ C(7,i) (1 − t)⁷⁻ⁱ tⁱ Pi,   0 ≤ t ≤ 1','C(7,i) = [1, 7, 21, 35, 35, 21, 7, 1]')+paragraph('This is the current degree-seven Bézier centreline between the straight leads. t is a curve parameter; it is not distance along the path. Each row supplies the X, Y and Z component of Pi in mm.')+table(['Point','X mm','Y mm','Z mm'],c.controls.map((p,i)=>['P'+i,...p.map(f)]))+
 eq('r′(t) = 7 Σᵢ₌₀⁶ C(6,i)(1 − t)⁶⁻ⁱ tⁱ(Pi+1 − Pi)')+eq('r″(t) = 42 Σᵢ₌₀⁵ C(5,i)(1 − t)⁵⁻ⁱ tⁱ(Pi+2 − 2Pi+1 + Pi)')+
 eq('T = r′ / |r′|; kvec = [r″ − T(T · r″)] / |r′|²; κ = |kvec|; R = 1 / κ')+
 eq('L ≈ Σ |ri − ri−1| + Lin + Lout',f(c.curveLength)+' + '+f(s.startLead||0)+' + '+f(s.endLead||0)+' = '+f(r.length)+' mm')+
 paragraph('Straight leads follow the specified endpoint tangent and have zero curvature and twist. Samples approximate arc length; the selected position uses the nearest saved sample.')+
 eq('φ(u) = Θ(10u³ − 15u⁴ + 6u⁵) + sin²(πu)[α(1 − u) + βu]', 'u = curve distance / curve length; Θ = '+f(turn)+' rad; α = '+f(r.params[8]||0)+' rad; β = '+f(r.params[9]||0)+' rad')+
 eq('ω = [30Θu²(1 − u)² + π sin(2πu)(α(1 − u) + βu) + sin²(πu)(β − α)] / Lcurve')+
 paragraph('φ is the extra roll applied to a parallel-transported section frame. Θ is the outlet correction relative to that transported frame, so it is not simply the difference between the two endpoint roll settings. ω is material twist in rad/mm, not Frenet torsion.');
}

function objectiveHTML(r,c){
 const o=c.objective,units=c.rigidity.physical?'N·mm':'relative units';
 return eq('d(s) = Bw kw² + 2 Bwh kw kh + Bh kh² + C ω²')+eq('Q = (50 / Iref) Σ [(di + di−1)/2] Δsi','Iref = '+f(c.Iref)+'; Q = '+f(o.elasticProxy))+
 paragraph('Q is a numerical route-shaping measure. The reference and factor 50 are fixed scaling choices for millimetres; Q and the score below are not measured physical properties.')+
 eq('q = 10^((slider − 50)/50)', '10^(('+f(r.input.stiffness)+' − 50)/50) = '+f(o.weight))+
 eq('Demand = q Q + L / 1000', f(o.weight)+' × '+f(o.elasticProxy)+' + '+f(r.length)+' / 1000 = '+f(o.demand))+
 eq('Score = Demand + 100000 Σvi² + 10000 Nhits', f(o.demand)+' + '+f(o.penalty)+' + '+f(o.contactPenalty)+' = '+f(o.score))+
 eq('vi = max(0, demand / limit − 1); Σvi² = '+f(o.violation), 'Radius uses Rlimit/Rmin; strain uses fractional strain; Nhits = '+f(o.contactCount))+
 (c.energy!==null?eq('U = ½ ∫ d(s) ds = Q Iref / 100',f(o.elasticProxy)+' × '+f(c.Iref)+' / 100 = '+f(c.energy)+' '+units):c.bendingEnergy!==null?eq('Ubending = Q Iref / 100 (C = 0)',f(o.elasticProxy)+' × '+f(c.Iref)+' / 100 = '+f(c.bendingEnergy)+' N·mm; total elastic energy unavailable'):paragraph('Physical energy is unavailable because physical assembly stiffness is not established.'))+
 paragraph('The slider weights elastic demand against length. It does not change a material modulus or stress on a fixed path. The search compares a finite set of candidate routes, favours checked feasible routes and reports the best one it finds; it does not prove a global optimum.');
}

function checksHTML(r,c){
 const g=c.section,s=r.input,b=g.bounds,gap=s.clearance||0;
 return table(['Check','Current value','Selected limit','Result'],c.checks.map(([name,value,limit,unit,v])=>[name,value===null&&name==='Minimum bend radius'?'Straight / ∞':f(value)+' '+unit,limit===null?'Disabled':f(limit)+' '+unit,limit===null?'Disabled':v<.0001?'Within numerical tolerance':'Exceeded']))+
 paragraph('The five geometric checks above generate the penalty terms. The 0.85 folding threshold is a geometric sweep guard, not a material strain allowance. The penalty comparison tolerates normalised excess below 0.0001.')+
 eq('P(s,x,y) = r(s) + a(s)x + b(s)y', 'Envelope x ∈ ['+f(b.minX-gap)+', '+f(b.maxX+gap)+']; y ∈ ['+f(b.minY-gap)+', '+f(b.maxY+gap)+'] mm; gap = '+f(gap)+' mm')+
 table(['Verification','Current result'],[['Endpoint separation',f(r.separation)+' mm (allowed 10–1,000 mm)'],['Saved path samples',r.samples.length],['Refinement',r.convergence?(r.convergence.stable?'Stable':'Unresolved'):'Not checked'],['Length / peak stability targets',r.convergence?'0.05% / 1%':'Not checked'],['Envelope clearance',r.clearance?.status||'Not checked'],['Close-interval subdivision limit',r.clearance?f(r.clearance.tolerance_mm)+' mm along the represented sweep':'Not checked']])+
 paragraph('Clearance checks use the piecewise linear outer-envelope sweep against obstacles and the workspace, plus non-neighbouring self-contact. Empty rib channels are not available clearance. The subdivision length is not a certified clearance-distance accuracy. Refinement and clear envelope checks are also required before CAD export.');
}

export function calculationsHTML(r){
 const c=calculationRecord(r);if(!c)return '<p>No current path. Correct the design inputs to show calculations.</p>';
 return '<div class="math-intro"><strong id="math-path-status">'+esc(c.status)+'</strong><p>Working for the displayed path. Values use its saved inputs and geometry, with rounded display numbers. Lengths are mm; 1 MPa = 1 N/mm².</p></div>'+
 '<div class="math-station-tools"><label for="calculation-station">Inspect the working along the path</label><input id="calculation-station" aria-label="Calculation position along path" type="range" min="0" max="1000" step="any" value="500"><div class="button-row"><button class="button" id="math-peak-strain">Peak PVC strain</button><button class="button" id="math-tightest-bend">Tightest bend</button></div></div><div id="math-station"></div>'+
 detail('section','Section geometry and pathway datum',sectionHTML(r.input,c))+
 detail('rigidity','Material and assembly stiffness',stiffnessHTML(r.input,c))+
 detail('path','Path equation, control points and twist',pathHTML(r,c))+
 detail('objective','Energy and route-selection score',objectiveHTML(r,c))+
 detail('limits','Design limits and numerical checks',checksHTML(r,c))+
 paragraph('These calculations explain the current beam and geometry model. Pushing force, friction, buckling, yielding and local wall deformation are not calculated.');
}

export function stationHTML(r,q){
 const a=stationWorking(r,q);if(!a)return '';
 let body='<h3>At '+f(a.s)+' mm along the path</h3>'+paragraph((a.segment==='curve'?'Curved span · Bézier t = '+f(a.parameter):a.segment==='inlet'?'Straight inlet':'Straight outlet')+'. This is the nearest saved sample to the slider position.')+
 eq('kw = kvec · a; kh = kvec · b', 'kw = '+f(a.ka)+' mm⁻¹; kh = '+f(a.kb)+' mm⁻¹')+
 eq('R = 1 / κ', a.radius===null?'κ ≈ 0 → straight at this sample':'1 / '+f(a.curvature)+' = '+f(a.radius)+' mm')+
 eq('ω = twist × π / (180 × 100)',f(a.twist)+' × π / 18000 = '+f(a.omega)+' rad/mm')+
 eq('εPVC = maxvertices |kw x + kh y|', '|('+f(a.ka)+') × ('+f(a.pvc.point[0])+') + ('+f(a.kb)+') × ('+f(a.pvc.point[1])+')| = '+f(a.pvc.strain)+' = '+f(100*a.pvc.strain)+'%')+
 eq('σPVC ≈ E εPVC',a.pvc.E===null?'Unavailable: enter a PVC bending modulus.':f(a.pvc.E)+' × '+f(a.pvc.strain)+' = '+f(a.pvc.stress)+' MPa')+
 paragraph('Modulus basis: '+(materialBasis(r.input).bendingSource||'unavailable')+'.')+paragraph('a and b are the width and height unit axes; kw and kh are signed curvature components. x and y are local material coordinates relative to the bending datum. The chosen PVC vertex gives the largest absolute bending strain at this sample.');
 const references=[['tensileStrengthMPa','Recorded tensile strength'],['flexuralStrengthMPa','Recorded flexural strength']].filter(([key])=>r.input.material[key]!==null);
 if(references.length)body+=eq('Reference comparison = 100 σPVC / recorded strength')+table(['Test reference','Recorded MPa','At this station'],references.map(([key,label])=>[label,f(r.input.material[key]),a.pvc.stress===null?'Needs a PVC modulus':f(a.pvc.stress*100/r.input.material[key])+'% of recorded value']))+paragraph('Recorded strengths are test references, not allowable stresses. These percentages are not factors of safety.');
 if(a.steel.length)body+=eq('εsteel,j = maxvertices |kw xj + kh yj|; σsteel,j ≈ Es εsteel,j')+table(['Insert','Governing x, y mm','Peak strain %','Nominal stress MPa'],a.steel.map(p=>[p.insert,vec(p.point),f(p.strain*100),f(p.stress)]))+paragraph(r.input.steel.fit==='bonded'?'PVC and steel use the shared elastic centre; perfect load transfer is assumed.':'Each sliding steel insert uses its own centroid; PVC uses the remaining PVC centroid.');
 body+=detail('station-vectors','Coordinates, section axes and local demand',table(['Vector / value','Current value'],[['Position r',vec(a.position)+' mm'],['Tangent T',vec(a.tangent)],['Width axis a',vec(a.widthAxis)],['Height axis b',vec(a.heightAxis)],['Curvature vector kvec',vec(a.curvatureVector)+' mm⁻¹'],['Added roll φ',f(a.roll)+' rad'],['Local folding measure',f(a.strains.fold)]])+eq('d = Bw kw² + 2 Bwh kw kh + Bh kh² + C ω²',f(a.terms.width)+' + ('+f(a.terms.coupling)+') + '+f(a.terms.height)+' + '+f(a.terms.twist)+' = '+f(a.density)+(a.physical?' N':' relative geometry units')));
 return '<div class="math-station-card">'+body+'</div>';
}

export function calculationReportHTML(r){
 const c=calculationRecord(r);if(!c)return '';
 const q=r.samples[r.strainIndex];
 const html='<section class="calculation-report"><h2>Calculation working for this path</h2>'+paragraph(c.status)+paragraph('The local worked example below is at the path’s peak PVC-strain sample.')+stationHTML(r,q).replace('<details class="math-detail"','<details open class="math-detail"')+
 '<h3>Section geometry</h3>'+sectionHTML(r.input,c)+'<h3>Active stiffness</h3>'+stiffnessHTML(r.input,c)+'<h3>Path and control points</h3>'+pathHTML(r,c)+'<h3>Energy and score</h3>'+objectiveHTML(r,c)+'<h3>Limits and verification</h3>'+checksHTML(r,c)+'</section>';
 return html.replaceAll('<details class="reference-sources">','<details open class="reference-sources">');
}
