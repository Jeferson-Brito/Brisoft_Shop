const fs=require('node:fs'),path=require('node:path');
function createBudget({file=null,limit=20}={}){
 let state={day:'',used:0};if(file&&fs.existsSync(file))state=JSON.parse(fs.readFileSync(file,'utf8'));
 return {take(){const day=new Date().toISOString().slice(0,10);if(state.day!==day)state={day,used:0};if(state.used>=limit)return false;state.used++;if(file){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);}return true;},status(){return {...state,limit};}};
}
module.exports={createBudget};
