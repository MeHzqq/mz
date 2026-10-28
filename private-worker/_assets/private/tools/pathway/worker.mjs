import {solve} from './solver.mjs';
self.onmessage=({data})=>{try{const result=solve(data.state,p=>self.postMessage({id:data.id,progress:p}));self.postMessage({id:data.id,result});}catch(e){self.postMessage({id:data.id,result:{error:e.message,feasible:false}});}};
