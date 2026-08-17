import { createServer,type Server } from 'node:http';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { OpenAICompatibleProvider, extractCleanJson } from '../packages/ai-core/src/index.js';
import { M2MError } from '../packages/shared/src/index.js';

describe('Vercel AI SDK provider adapter',()=>{
  let server:Server;let baseUrl:string;
  beforeAll(async()=>{
    server=createServer((request,response)=>{
      let raw='';request.on('data',chunk=>{raw+=String(chunk)});request.on('end',()=>{
        const body=JSON.parse(raw) as {stream?:boolean;messages?:Array<{content?:string}>;model?:string};
        const prompt=body.messages?.at(-1)?.content??'';
        if(prompt==='fail'){response.writeHead(503,{'content-type':'application/json'});response.end(JSON.stringify({error:{message:'temporarily unavailable'}}));return}
        if(body.stream){response.writeHead(200,{'content-type':'text/event-stream'});response.write(`data: ${JSON.stringify({id:'chunk-1',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{role:'assistant',content:'hello '},finish_reason:null}]})}\n\n`);response.write(`data: ${JSON.stringify({id:'chunk-1',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{content:'stream'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:2,total_tokens:4}})}\n\n`);response.end('data: [DONE]\n\n');return}
        response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({id:'completion-1',object:'chat.completion',created:1,model:body.model,choices:[{index:0,message:{role:'assistant',content:'hello m2m'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:2,total_tokens:4}}));
      });
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('Mock AI server has no port');baseUrl=`http://127.0.0.1:${address.port}/v1`;
  });
  afterAll(async()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  it('generates text and usage through the AI SDK',async()=>{
    const result=await new OpenAICompatibleProvider().generateText({model:'test-model',prompt:'hello',apiKey:'test-key',baseUrl});
    expect(result).toMatchObject({text:'hello m2m',model:'test-model',provider:'openai-compatible',usage:{inputTokens:2,outputTokens:2}});
  });
  it('streams text deltas through the AI SDK',async()=>{
    const chunks=[];for await(const event of new OpenAICompatibleProvider().streamText({model:'test-model',prompt:'stream',apiKey:'test-key',baseUrl}))chunks.push(event);
    expect(chunks.filter(event=>event.type==='text-delta').map(event=>event.text).join('')).toBe('hello stream');expect(chunks.at(-1)?.result?.text).toBe('hello stream');
  });
  it('classifies temporary provider errors as retryable',async()=>{
    await expect(new OpenAICompatibleProvider().generateText({model:'test-model',prompt:'fail',apiKey:'test-key',baseUrl})).rejects.toMatchObject<M2MError>({code:'AI_PROVIDER_ERROR',retryable:true});
  });

  it('correctly parses markdown-wrapped JSON code blocks in structured output', () => {
    expect(extractCleanJson('{"label":"positive","confidence":0.95}')).toEqual({ label: 'positive', confidence: 0.95 });
    expect(extractCleanJson('```json\n{\n  "label": "epic_action",\n  "confidence": 0.98\n}\n```')).toEqual({ label: 'epic_action', confidence: 0.98 });
    expect(extractCleanJson('Here is the result:\n```json\n{"label":"calm_luxury","confidence":0.9}\n```\nHope it helps!')).toEqual({ label: 'calm_luxury', confidence: 0.9 });
    expect(extractCleanJson('```\n["item1", "item2"]\n```')).toEqual(['item1', 'item2']);
  });

  it('repairs truncated and dirty JSON with unterminated strings and trailing commas', () => {
    // Unterminated string due to token cutoff
    expect(extractCleanJson('{"label": "epic_action", "confidence": 0.95, "reason": "Tuyệt vời! Với vai trò là một đạo')).toEqual({
      label: 'epic_action',
      confidence: 0.95,
      reason: 'Tuyệt vời! Với vai trò là một đạo',
    });

    // Trailing comma and single quotes
    expect(extractCleanJson("{\n 'label': 'calm_luxury',\n 'confidence': 0.88,\n}")).toEqual({
      label: 'calm_luxury',
      confidence: 0.88,
    });

    // Truncated object cut off before closing brace
    expect(extractCleanJson('{"label": "comedic_fun", "confidence": 0.99')).toEqual({
      label: 'comedic_fun',
      confidence: 0.99,
    });
  });
});
