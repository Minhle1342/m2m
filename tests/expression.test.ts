import { describe,expect,it } from 'vitest';
import { evaluateExpression,resolveExpressions,validateExpression } from '../packages/workflow-core/src/expression/index.js';

const context={json:{email:'dev@m2m.local',customerEmail:' Dev@M2M.Local ',profile:{name:'M2M'}},node:{Webhook:{json:{body:{id:42}}}},env:{API_URL:'http://localhost:3000'},workflow:{id:'workflow-1'},execution:{id:'execution-1'}};

describe('expression engine',()=>{
  it('resolves supported read-only roots and nested paths',()=>{
    expect(evaluateExpression('$json.profile.name',context)).toBe('M2M');
    expect(evaluateExpression('$node["Webhook"].json.body.id',context)).toBe(42);
    expect(resolveExpressions({url:'{{$env.API_URL}}/users/{{$json.email}}'},context)).toEqual({url:'http://localhost:3000/users/dev@m2m.local'});
  });
  it('applies only approved terminal string transforms without evaluating JavaScript',()=>{
    expect(evaluateExpression('$json.customerEmail.toLowerCase()',context)).toBe(' dev@m2m.local ');
    expect(evaluateExpression('$json.customerEmail.trim().toLowerCase()',context)).toBe('dev@m2m.local');
    expect(resolveExpressions({email:'{{ $json.customerEmail.trim().toLowerCase() }}'},context)).toEqual({email:'dev@m2m.local'});
  });
  it.each(['process.env.SECRET','require("fs")','$json.constructor.constructor("return process")()','globalThis.fetch'])('rejects unsafe expression %s',(value)=>expect(()=>validateExpression(value)).toThrow());
  it.each(['$json.email.replace("dev","admin")','$json.email.slice(1)','$json.email.toLowerCase.call()'])('rejects non-whitelisted executable syntax %s',(value)=>expect(()=>validateExpression(value)).toThrow());
  it('rejects string transforms for non-string values',()=>expect(()=>evaluateExpression('$json.profile.toLowerCase()',context)).toThrow(/requires a string value/));
});
