import { describe,expect,it } from 'vitest';
import { NodeRegistry,type M2MNode } from '../packages/node-sdk/src/index.js';
import { M2MError,type ExecutionEvent,type WorkflowNode } from '../packages/shared/src/index.js';
import { executeWorkflow,type NodeLifecycleRecord } from '../packages/workflow-core/src/executor.js';

const trigger:M2MNode={type:'test.trigger',version:1,metadata:{type:'test.trigger',version:1,displayName:'Trigger',category:'trigger',inputs:0,outputs:1,properties:[]},execute:async({input})=>({json:input})};
function hooks(events:ExecutionEvent[],records:NodeLifecycleRecord[]){return{publish:async(event:ExecutionEvent)=>{events.push(event)},nodeStarted:async(_node:WorkflowNode,_input:unknown,_attempt:number)=>undefined,nodeFinished:async(record:NodeLifecycleRecord)=>{records.push(record)},resolveCredentials:async()=>({}),isCancelled:async()=>false}}

describe('workflow executor',()=>{
  it('follows the selected IF-style source handle',async()=>{
    const registry=new NodeRegistry();registry.register(trigger);registry.register({type:'test.branch',version:1,metadata:{type:'test.branch',version:1,displayName:'Branch',category:'core',inputs:1,outputs:2,properties:[]},execute:async()=>({json:{ok:true},branch:'true'})});registry.register({type:'test.end',version:1,metadata:{type:'test.end',version:1,displayName:'End',category:'core',inputs:1,outputs:0,properties:[]},execute:async({node})=>({json:node.name})});
    const events:ExecutionEvent[]=[],records:NodeLifecycleRecord[]=[];
    const result=await executeWorkflow({executionId:'e1',workflowId:'w1',registry,hooks:hooks(events,records),definition:{nodes:[{id:'t',type:'test.trigger',name:'Trigger',position:{x:0,y:0},parameters:{}},{id:'b',type:'test.branch',name:'Branch',position:{x:1,y:0},parameters:{}},{id:'yes',type:'test.end',name:'Yes',position:{x:2,y:0},parameters:{}},{id:'no',type:'test.end',name:'No',position:{x:2,y:1},parameters:{}}],edges:[{id:'1',source:'t',target:'b'},{id:'2',source:'b',target:'yes',sourceHandle:'true'},{id:'3',source:'b',target:'no',sourceHandle:'false'}],settings:{}}});
    expect(result.yes?.json).toBe('Yes');expect(result.no).toBeUndefined();expect(events.some(event=>event.event==='node.completed')).toBe(true);
  });
  it('retries retryable failures using the node policy',async()=>{
    let attempts=0;const registry=new NodeRegistry();registry.register(trigger);registry.register({type:'test.flaky',version:1,metadata:{type:'test.flaky',version:1,displayName:'Flaky',category:'core',inputs:1,outputs:1,properties:[]},execute:async()=>{attempts+=1;if(attempts===1)throw new M2MError('HTTP_ERROR','temporary',true);return{json:'recovered'}}});
    const records:NodeLifecycleRecord[]=[];const result=await executeWorkflow({executionId:'e2',workflowId:'w2',registry,hooks:hooks([],records),definition:{nodes:[{id:'t',type:'test.trigger',name:'Trigger',position:{x:0,y:0},parameters:{}},{id:'f',type:'test.flaky',name:'Flaky',position:{x:1,y:0},parameters:{},retry:{enabled:true,maxAttempts:2,delayMs:1,backoff:'fixed'}}],edges:[{id:'1',source:'t',target:'f'}],settings:{}}});
    expect(attempts).toBe(2);expect(result.f.json).toBe('recovered');expect(records.filter(record=>record.node.id==='f')).toHaveLength(2);expect(records.find(record=>record.node.id==='f'&&record.attempt===1)?.error?.retryable).toBe(true);
  });
  it('settles an unselected branch so a downstream merge can run',async()=>{
    const registry=new NodeRegistry();registry.register(trigger);
    registry.register({type:'test.branch',version:1,metadata:{type:'test.branch',version:1,displayName:'Branch',category:'core',inputs:1,outputs:2,properties:[]},execute:async()=>({json:{selected:true},branch:'true'})});
    registry.register({type:'test.pass',version:1,metadata:{type:'test.pass',version:1,displayName:'Pass',category:'core',inputs:1,outputs:1,properties:[]},execute:async({input})=>({json:input})});
    registry.register({type:'test.merge',version:1,metadata:{type:'test.merge',version:1,displayName:'Merge',category:'core',inputs:2,outputs:1,properties:[]},execute:async({input})=>({json:input})});
    const skipped:string[]=[];const base=hooks([],[]);
    const result=await executeWorkflow({executionId:'e3',workflowId:'w3',registry,hooks:{...base,nodeSkipped:async(node)=>{skipped.push(node.id)}},definition:{nodes:[
      {id:'t',type:'test.trigger',name:'Trigger',position:{x:0,y:0},parameters:{}},
      {id:'b',type:'test.branch',name:'Branch',position:{x:1,y:0},parameters:{}},
      {id:'yes',type:'test.pass',name:'Yes',position:{x:2,y:0},parameters:{}},
      {id:'no',type:'test.pass',name:'No',position:{x:2,y:1},parameters:{}},
      {id:'merge',type:'test.merge',name:'Merge',position:{x:3,y:0},parameters:{}},
    ],edges:[
      {id:'1',source:'t',target:'b'},{id:'2',source:'b',target:'yes',sourceHandle:'true'},
      {id:'3',source:'b',target:'no',sourceHandle:'false'},{id:'4',source:'yes',target:'merge'},{id:'5',source:'no',target:'merge'},
    ],settings:{}}});
    expect(skipped).toContain('no');expect(result.merge?.json).toEqual({selected:true});
  });
  it('executes a linear chain from start node to end node', async () => {
    const registry = new NodeRegistry();
    registry.register(trigger);
    registry.register({
      type: 'test.step1',
      version: 1,
      metadata: { type: 'test.step1', version: 1, displayName: 'Step1', category: 'core', inputs: 1, outputs: 1, properties: [] },
      execute: async ({ input }) => ({ json: { count: (input as any)?.count + 1 } })
    });
    registry.register({
      type: 'test.step2',
      version: 1,
      metadata: { type: 'test.step2', version: 1, displayName: 'Step2', category: 'core', inputs: 1, outputs: 1, properties: [] },
      execute: async ({ input }) => ({ json: { count: (input as any)?.count + 10 } })
    });

    const events: ExecutionEvent[] = [];
    const records: NodeLifecycleRecord[] = [];
    const result = await executeWorkflow({
      executionId: 'e4',
      workflowId: 'w4',
      registry,
      triggerData: { count: 0 },
      hooks: hooks(events, records),
      definition: {
        nodes: [
          { id: 't', type: 'test.trigger', name: 'Trigger', position: { x: 0, y: 0 }, parameters: {} },
          { id: 's1', type: 'test.step1', name: 'Step 1', position: { x: 1, y: 0 }, parameters: {} },
          { id: 's2', type: 'test.step2', name: 'Step 2', position: { x: 2, y: 0 }, parameters: {} }
        ],
        edges: [
          { id: 'e1', source: 't', target: 's1' },
          { id: 'e2', source: 's1', target: 's2' }
        ],
        settings: {}
      }
    });

    expect(result.t.json).toEqual({ count: 0 });
    expect(result.s1.json).toEqual({ count: 1 });
    expect(result.s2.json).toEqual({ count: 11 });
    expect(records.map((r) => r.node.id)).toEqual(['t', 's1', 's2']);
  });
});

