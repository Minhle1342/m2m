import { describe,expect,it } from 'vitest';
import { createNodeRegistry } from '../packages/config/src/index.js';
import { validateWorkflow } from '../packages/workflow-core/src/validation.js';

describe('node registry and graph validation',()=>{
  const registry=createNodeRegistry();
  it('exposes backend-driven node metadata',()=>{
    expect(registry.get('trigger.manual').metadata.category).toBe('trigger');
    expect(registry.get('ai.prompt').metadata.properties.some(property=>property.name==='provider')).toBe(true);
    expect(registry.list().length).toBeGreaterThanOrEqual(17);
    expect(registry.get('trigger.schedule').metadata.outputNames).toBeUndefined();
    expect(registry.get('core.switch').metadata.outputNames).toEqual(['case1','case2','case3','case4','default']);
    expect(registry.get('data.mapFields').metadata.category).toBe('data');
  });
  it('reports missing trigger, unknown nodes, broken edges and cycles',()=>{
    const result=validateWorkflow({nodes:[{id:'a',type:'core.setData',name:'A',position:{x:0,y:0},parameters:{values:{}}},{id:'b',type:'missing',name:'B',position:{x:1,y:1},parameters:{}}],edges:[{id:'a-b',source:'a',target:'b'},{id:'b-a',source:'b',target:'a'},{id:'broken',source:'a',target:'c'}],settings:{}},registry);
    expect(result.valid).toBe(false);
    expect(result.errors.map(error=>error.message).join(' ')).toMatch(/trigger/i);
    expect(result.errors.map(error=>error.message).join(' ')).toMatch(/Unknown node type/);
    expect(result.errors.map(error=>error.message).join(' ')).toMatch(/missing node/);
    expect(result.errors.map(error=>error.message).join(' ')).toMatch(/cycles/);
  });
  it('requires a credential for cloud media providers',()=>{
    const result=validateWorkflow({nodes:[
      {id:'trigger',type:'trigger.manual',name:'Manual',position:{x:0,y:0},parameters:{}},
      {id:'video',type:'m2m.media.imageToVideo',name:'Video',position:{x:1,y:1},parameters:{provider:'huggingface',model:'hf-ltx-video-i2v',prompt:'Move'}}
    ],edges:[{id:'trigger-video',source:'trigger',target:'video'}],settings:{}},registry);
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({code:'CREDENTIAL_REQUIRED',nodeId:'video'})]));
  });
});
