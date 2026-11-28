import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import * as logic from "../../src/eventLog/logic";
import * as account from "../../src/eventLog/account";

const source=readFileSync(new URL("../../src/eventLog/report.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const modules:Record<string,any>={
    "~git-hash":{__esModule:true,default:"fixture"},
    "./account":account,"./logic":logic,
    "../orion/integration":{getOrionIntegrationHealth:()=>({kind:"connected",installedVersion:"fixture"})},
    "../plugin/version":{QUESTUI_VERSION:"fixture"}
};
const mod={exports:{} as any};
new Function("require","module","exports","window","navigator","VERSION","IS_DISCORD_DESKTOP",js)((name:string)=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];},mod,mod.exports,{GLOBAL_ENV:{RELEASE_CHANNEL:"stable"}},{platform:"test",userAgent:"test"},"test",false);
const event={id:"fixture",eventCode:"QUEST_CLAIM_ALL_STOPPED",source:"questui",severity:"warning",timestamp:0,summary:"Claim all stopped",quest:{id:"q",name:"Quest"}};
const report=(detail:Record<string,unknown>)=>mod.exports.buildDiagnosticReport({...event,detail});
const http=report({actionCode:"HTTP_RATE_LIMITED",httpStatus:429,retryAfterMs:4000,position:9,total:9,confirmed:8,skipped:0});
assert.match(http,/HTTP Status:\s+429/);
assert.match(http,/Action Code:\s+HTTP_RATE_LIMITED/);
assert.match(http,/Wait \(ms\):\s+4000/);
assert.match(http,/Batch Progress:\s+9 \/ 9/);
assert.match(http,/Confirmed:\s+8/);
assert.match(http,/Skipped:\s+0/);
const local=report({actionCode:"LOCAL_SUBMISSION_PENDING",retryAfterMs:15000});
assert.match(local,/Action Code:\s+LOCAL_SUBMISSION_PENDING/);
assert.doesNotMatch(local,/HTTP Status:/);
assert.doesNotMatch(report({retryAfterMs:-1}),/Wait \(ms\):/);
console.log("Quest diagnostic report preserves actual HTTP status, local action code, cooldown and batch progress: PASS");
