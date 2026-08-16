import { createServer,type Server } from 'node:http';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { OpenAICompatibleProvider } from '../packages/ai-core/src/index.js';
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
});
