import { isIP } from 'node:net';
import type { AgentTool, ModelRouter } from '@m2m/ai-core';
import type { M2MNode, NodeExecutionContext, NodeMetadata, NodeRegistry } from '@m2m/node-sdk';
import { M2MError } from '@m2m/shared';

const providerProperty = { name: 'provider', displayName: 'Provider', type: 'select' as const, required: true, default: 'gemini', options: [
  {label:'Google Gemini',value:'gemini'},{label:'OpenAI-compatible',value:'openai-compatible'},{label:'Ollama (local)',value:'ollama'},
] };
const modelProperty = { name: 'model', displayName: 'Model', type: 'string' as const, required: true, default: 'gemini-2.5-flash' };

export function resolveTextParam(paramValue: unknown, input: unknown): string {
  if (typeof paramValue === 'string' && paramValue.trim() && paramValue !== 'undefined' && paramValue !== 'null') {
    return paramValue.trim();
  }
  if (typeof input === 'string') return input.trim();
  if (input && typeof input === 'object') {
    const rec = input as Record<string, unknown>;
    if (typeof rec.text === 'string' && rec.text.trim()) return rec.text.trim();
    if (typeof rec.content === 'string' && rec.content.trim()) return rec.content.trim();
    if (typeof rec.prompt === 'string' && rec.prompt.trim()) return rec.prompt.trim();
    if (typeof rec.result === 'string' && rec.result.trim()) return rec.result.trim();
    if (typeof rec.description === 'string' && rec.description.trim()) return rec.description.trim();
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim();
    if (typeof rec.json === 'string' && rec.json.trim()) return rec.json.trim();
    if (rec.json && typeof rec.json === 'object') {
      return resolveTextParam('', rec.json);
    }
    return JSON.stringify(input);
  }
  return '';
}

function modelInput(context: NodeExecutionContext) {
  const credential = Object.values(context.credentials)[0];
  const providerId = String(context.node.parameters.provider ?? 'gemini');
  let apiKey: string | undefined = credential?.data.apiKey;
  if (!apiKey) {
    if (providerId === 'gemini') apiKey = process.env.GEMINI_API_KEY;
    else if (providerId === 'openai') apiKey = process.env.OPENAI_API_KEY;
    else if (providerId === 'siliconflow') apiKey = process.env.SILICONFLOW_API_KEY;
    else if (providerId === 'groq') apiKey = process.env.GROQ_API_KEY;
    else if (providerId === 'deepseek') apiKey = process.env.DEEPSEEK_API_KEY;
  }
  return {
    model: String(context.node.parameters.model || (providerId === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini')),
    providerId,
    temperature: Number(context.node.parameters.temperature ?? 0.2),
    maxTokens: Number(context.node.parameters.maxTokens ?? 2048),
    apiKey,
    baseUrl: credential?.data.baseUrl,
  };
}

class AIPromptNode implements M2MNode {
  readonly type = 'ai.prompt';
  readonly version = 1;
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'AI Prompt', category: 'ai', icon: 'sparkles', inputs: 1, outputs: 1,
    properties: [
      providerProperty,
      modelProperty,
      { name: 'system', displayName: 'System Prompt', type: 'string' },
      { name: 'prompt', displayName: 'Prompt', type: 'string', required: true },
      { name: 'temperature', displayName: 'Temperature', type: 'number', default: 0.2 },
      { name: 'maxTokens', displayName: 'Max Tokens', type: 'number', default: 1024 },
    ],
  };
  constructor(private readonly router: ModelRouter) {}
  async execute(context: NodeExecutionContext) {
    const { node } = context;
    const config = modelInput(context);
    const promptValue = resolveTextParam(node.parameters.prompt, context.input);
    const result = await this.router.get(config.providerId).generateText({
      model: config.model, prompt: promptValue,
      system: node.parameters.system ? String(node.parameters.system) : undefined,
      temperature: config.temperature, maxTokens: config.maxTokens,
      apiKey: config.apiKey, baseUrl: config.baseUrl,
    });
    return { json: { text: result.text, provider: result.provider, model: result.model, usage: result.usage } };
  }
}

class ChatModelNode implements M2MNode {
  readonly type = 'ai.chatModel'; readonly version = 1;
  readonly metadata: NodeMetadata = {
    type:this.type,version:1,displayName:'Chat Model',category:'ai',icon:'message-circle',inputs:1,outputs:1,
    description:'Provide reusable model configuration to an AI Agent.',
    properties:[providerProperty,modelProperty,{name:'temperature',displayName:'Temperature',type:'number',default:0.2},{name:'maxTokens',displayName:'Max Tokens',type:'number',default:2048}],
  };
  async execute(context: NodeExecutionContext) {
    const config=modelInput(context);
    return {json:{modelConfig:{provider:config.providerId,model:config.model,temperature:config.temperature,maxTokens:config.maxTokens}}};
  }
}

interface ToolDescriptor {
  name: string;
  type: 'http' | 'dateTime' | 'calculator' | 'dataLookup' | 'workflow';
  description?: string;
  config?: Record<string, unknown>;
}

function descriptor(value: unknown): ToolDescriptor {
  if (!value || typeof value !== 'object') throw new M2MError('VALIDATION_ERROR','AI tool definition must be an object');
  const candidate=value as Record<string,unknown>;
  const type=String(candidate.type) as ToolDescriptor['type'];
  if (!['http','dateTime','calculator','dataLookup','workflow'].includes(type)) throw new M2MError('VALIDATION_ERROR',`Unsupported AI tool type: ${type}`);
  const name=String(candidate.name??type).replace(/[^a-zA-Z0-9_-]/g,'_');
  if (!name) throw new M2MError('VALIDATION_ERROR','AI tool name is required');
  return {name,type,description:candidate.description?String(candidate.description):undefined,config:candidate.config&&typeof candidate.config==='object'?candidate.config as Record<string,unknown>:undefined};
}

class AIToolNode implements M2MNode {
  readonly type='ai.tool';readonly version=1;
  readonly metadata:NodeMetadata={
    type:this.type,version:1,displayName:'AI Tool',category:'ai',icon:'wrench',inputs:1,outputs:1,
    properties:[
      {name:'name',displayName:'Tool name',type:'string',required:true,default:'tool'},
      {name:'toolType',displayName:'Tool type',type:'select',required:true,default:'http',options:[
        {label:'HTTP Request',value:'http'},{label:'Date / Time',value:'dateTime'},{label:'Calculator',value:'calculator'},
        {label:'Internal Data Lookup',value:'dataLookup'},{label:'Workflow',value:'workflow'},
      ]},
      {name:'description',displayName:'Description',type:'string',default:'A tool available to the AI agent'},
      {name:'config',displayName:'Configuration',type:'json',default:{}},
    ],
  };
  async execute({node}:NodeExecutionContext){return{json:{tools:[descriptor({name:node.parameters.name,type:node.parameters.toolType,description:node.parameters.description,config:node.parameters.config})]}};}
}

function safeHttpUrl(raw:string):URL{
  let url:URL;try{url=new URL(raw);}catch{throw new M2MError('VALIDATION_ERROR','AI HTTP tool URL is invalid');}
  if(!['http:','https:'].includes(url.protocol))throw new M2MError('VALIDATION_ERROR','AI HTTP tool allows only HTTP(S) URLs');
  if(process.env.NODE_ENV==='production'){
    const host=url.hostname.toLowerCase();
    const privateHost=host==='localhost'||host.endsWith('.local')||host==='0.0.0.0'||host==='::1'||/^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||/^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)||(isIP(host)===6&&/^(?:fc|fd|fe80)/i.test(host));
    if(privateHost)throw new M2MError('HTTP_SSRF_BLOCKED','Private network destinations are blocked');
  }
  return url;
}

function calculate(expression:string):number{
  const tokens=expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g)??[];let index=0;
  if(tokens.join('')!==expression.replace(/\s+/g,''))throw new M2MError('VALIDATION_ERROR','Calculator expression contains unsupported characters');
  const factor=():number=>{const token=tokens[index++];if(token==='('){const value=sum();if(tokens[index++]!==')')throw new M2MError('VALIDATION_ERROR','Calculator parentheses are unbalanced');return value;}if(token==='-')return-factor();const value=Number(token);if(!Number.isFinite(value))throw new M2MError('VALIDATION_ERROR','Calculator expression is invalid');return value;};
  const product=():number=>{let value=factor();while(tokens[index]==='*'||tokens[index]==='/'){const op=tokens[index++];const right=factor();value=op==='*'?value*right:value/right;}return value;};
  const sum=():number=>{let value=product();while(tokens[index]==='+'||tokens[index]==='-'){const op=tokens[index++];const right=product();value=op==='+'?value+right:value-right;}return value;};
  const value=sum();if(index!==tokens.length||!Number.isFinite(value))throw new M2MError('VALIDATION_ERROR','Calculator expression is invalid');return value;
}

function lookup(value:unknown,path:string):unknown{return path.split('.').filter(Boolean).reduce<unknown>((current,key)=>current&&typeof current==='object'?(current as Record<string,unknown>)[key]:undefined,value);}

function toolSchema(type:ToolDescriptor['type']):Record<string,unknown>{
  if(type==='http')return{type:'object',properties:{url:{type:'string'},method:{type:'string'},headers:{type:'object'},body:{}},required:['url'],additionalProperties:false};
  if(type==='calculator')return{type:'object',properties:{expression:{type:'string'}},required:['expression'],additionalProperties:false};
  if(type==='dataLookup')return{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false};
  if(type==='workflow')return{type:'object',properties:{workflowId:{type:'string'},input:{}},required:['workflowId'],additionalProperties:false};
  return{type:'object',properties:{timezone:{type:'string'}},additionalProperties:false};
}

function createAgentTool(definition:ToolDescriptor,context:NodeExecutionContext):AgentTool{
  return{name:definition.name,description:definition.description??`Execute ${definition.type}`,inputSchema:toolSchema(definition.type),execute:async(raw,signal)=>{
    const input=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
    if(definition.type==='dateTime'){const now=new Date(),timezone=String(input.timezone??definition.config?.timezone??'UTC');let local:string;try{local=new Intl.DateTimeFormat('en-CA',{dateStyle:'full',timeStyle:'long',timeZone:timezone}).format(now);}catch{throw new M2MError('VALIDATION_ERROR',`Invalid timezone: ${timezone}`);}return{iso:now.toISOString(),local,timezone,unixMs:now.getTime()};}
    if(definition.type==='calculator')return{result:calculate(String(input.expression??''))};
    if(definition.type==='dataLookup')return{value:lookup(context.input,String(input.path??''))};
    const credential=Object.values(context.credentials)[0];
    if(definition.type==='workflow'){
      const baseUrl=String(process.env.INTERNAL_API_BASE_URL??(process.env.NODE_ENV==='production'?null:definition.config?.apiBaseUrl)??'http://127.0.0.1:3000').replace(/\/$/,'');
      const workflowId=encodeURIComponent(String(input.workflowId??definition.config?.workflowId??''));
      if(!workflowId)throw new M2MError('VALIDATION_ERROR','Workflow tool requires workflowId');
      const response=await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/run`,{method:'POST',headers:{'content-type':'application/json',...(credential?.data.token?{authorization:`Bearer ${credential.data.token}`}:{})},body:JSON.stringify(input.input??{}),signal});
      if(!response.ok)throw new M2MError('AI_TOOL_ERROR',`Workflow tool returned HTTP ${response.status}`,response.status>=500);
      return response.json();
    }
    const url=safeHttpUrl(String(input.url??definition.config?.url??''));const method=String(input.method??definition.config?.method??'GET').toUpperCase();
    const headers=new Headers((input.headers??definition.config?.headers??{}) as Record<string,string>);if(credential?.data.token)headers.set('authorization',`Bearer ${credential.data.token}`);
    const body=!['GET','HEAD'].includes(method)&&input.body!==undefined?JSON.stringify(input.body):undefined;if(body)headers.set('content-type',headers.get('content-type')??'application/json');
    const response=await fetch(url,{method,headers,body,signal});const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>2*1024*1024)throw new M2MError('HTTP_RESPONSE_TOO_LARGE','AI HTTP tool response exceeds 2 MB');const text=new TextDecoder().decode(bytes);let data:unknown=text;try{data=JSON.parse(text);}catch{/* preserve text */}
    if(!response.ok)throw new M2MError('AI_TOOL_ERROR',`AI HTTP tool returned HTTP ${response.status}`,[429,502,503,504].includes(response.status),data);return{status:response.status,data};
  }};
}

function inputObjects(input:unknown):Record<string,unknown>[] {
  if(Array.isArray(input))return input.flatMap(inputObjects);
  return input&&typeof input==='object'?[input as Record<string,unknown>]:[];
}

class AIAgentNode implements M2MNode {
  readonly type='ai.agent';readonly version=1;
  readonly metadata:NodeMetadata={
    type:this.type,version:1,displayName:'AI Agent',category:'ai',icon:'bot',inputs:1,outputs:1,
    properties:[providerProperty,modelProperty,
      {name:'system',displayName:'System Prompt',type:'string',default:'You are a careful automation agent. Use tools only when needed.'},
      {name:'prompt',displayName:'User Prompt',type:'string',required:true},
      {name:'tools',displayName:'Inline tools',type:'json',default:[]},
      {name:'maxSteps',displayName:'Maximum steps',type:'number',default:5},
      {name:'temperature',displayName:'Temperature',type:'number',default:0.1},
      {name:'maxTokens',displayName:'Max Tokens',type:'number',default:2048},
    ],
  };
  constructor(private readonly router:ModelRouter){}
  async execute(context:NodeExecutionContext){
    const objects=inputObjects(context.input);
    const inputTools=objects.flatMap(item=>Array.isArray(item.tools)?item.tools:[]);
    const inlineTools=Array.isArray(context.node.parameters.tools)?context.node.parameters.tools:[];
    const definitions=[...inputTools,...inlineTools].map(descriptor);
    const inputModel=objects.map(item=>item.modelConfig).find(value=>value&&typeof value==='object') as Record<string,unknown>|undefined;
    const base=modelInput(context);const providerId=String(inputModel?.provider??base.providerId);const model=String(inputModel?.model??base.model);
    const histories=objects.flatMap(item=>Array.isArray(item.history)?item.history:[]);
    const prompt=histories.length>0?`Conversation memory:\n${JSON.stringify(histories)}\n\nCurrent request:\n${String(context.node.parameters.prompt)}`:String(context.node.parameters.prompt);
    const result=await this.router.get(providerId).generateAgent({
      model,prompt,system:context.node.parameters.system?String(context.node.parameters.system):undefined,
      temperature:Number(inputModel?.temperature??base.temperature),maxTokens:Number(inputModel?.maxTokens??base.maxTokens),
      maxSteps:Number(context.node.parameters.maxSteps??5),apiKey:base.apiKey,baseUrl:base.baseUrl,
      tools:definitions.map(item=>createAgentTool(item,context)),
    });
    return{json:{text:result.text,provider:result.provider,model:result.model,usage:result.usage,steps:result.steps,toolCalls:result.toolCalls,toolResults:result.toolResults}};
  }
}

function validateSchema(value:unknown,schema:unknown,path='$'):unknown{
  if(!schema||typeof schema!=='object')return value;const rule=schema as Record<string,unknown>;const type=String(rule.type??'');
  const valid=type==='object'?Boolean(value&&typeof value==='object'&&!Array.isArray(value)):type==='array'?Array.isArray(value):type==='string'?typeof value==='string':type==='number'?typeof value==='number'&&Number.isFinite(value):type==='integer'?Number.isInteger(value):type==='boolean'?typeof value==='boolean':type==='null'?value===null:true;
  if(!valid)throw new M2MError('AI_STRUCTURED_OUTPUT_ERROR',`${path} must be ${type}`);
  if(type==='object'){
    const record=value as Record<string,unknown>;const required=Array.isArray(rule.required)?rule.required.map(String):[];
    for(const key of required)if(record[key]===undefined)throw new M2MError('AI_STRUCTURED_OUTPUT_ERROR',`${path}.${key} is required`);
    if(rule.properties&&typeof rule.properties==='object')for(const [key,child]of Object.entries(rule.properties as Record<string,unknown>))if(record[key]!==undefined)validateSchema(record[key],child,`${path}.${key}`);
  }
  if(type==='array'&&rule.items)for(const[index,item]of(value as unknown[]).entries())validateSchema(item,rule.items,`${path}[${index}]`);
  if(Array.isArray(rule.enum)&&!rule.enum.some(item=>item===value))throw new M2MError('AI_STRUCTURED_OUTPUT_ERROR',`${path} is not an allowed value`);
  return value;
}

class StructuredOutputNode implements M2MNode{
  readonly type='ai.structuredOutput';readonly version=1;
  readonly metadata:NodeMetadata={type:this.type,version:1,displayName:'Structured Output',category:'ai',icon:'braces',inputs:1,outputs:1,properties:[
    providerProperty,modelProperty,{name:'prompt',displayName:'Prompt',type:'string',required:true,default:'Convert the input into the requested JSON structure.'},
    {name:'schema',displayName:'JSON Schema',type:'json',required:true,default:{type:'object',properties:{result:{type:'string'}},required:['result']}},
    {name:'temperature',displayName:'Temperature',type:'number',default:0},{name:'maxTokens',displayName:'Max Tokens',type:'number',default:2048},
  ]};
  constructor(private readonly router:ModelRouter){}
  async execute(context:NodeExecutionContext){
    const config=modelInput(context);
    const schema=context.node.parameters.schema;
    const promptValue = resolveTextParam(context.node.parameters.prompt, context.input);
    const result=await this.router.get(config.providerId).generateStructured({
      model:config.model,
      prompt:`${promptValue}\n\nInput Data:\n${JSON.stringify(context.input)}\n\nJSON Schema:\n${JSON.stringify(schema)}\n\nEnsure all required properties in the schema are present in the JSON response.`,
      temperature:config.temperature,
      maxTokens:config.maxTokens,
      apiKey:config.apiKey,
      baseUrl:config.baseUrl,
      parse:(value)=>validateSchema(value,schema),
    });
    return{json:result};
  }
}

class TextClassificationNode implements M2MNode{
  readonly type='ai.textClassification';readonly version=1;
  readonly metadata:NodeMetadata={type:this.type,version:1,displayName:'Text Classification',category:'ai',icon:'tags',inputs:1,outputs:1,properties:[
    providerProperty,modelProperty,{name:'text',displayName:'Text',type:'string',required:true},{name:'labels',displayName:'Labels',type:'json',required:true,default:['positive','neutral','negative']},
    {name:'instructions',displayName:'Instructions',type:'string',default:'Choose exactly one label.'},
  ]};
  constructor(private readonly router:ModelRouter){}
  async execute(context:NodeExecutionContext){
    const labels=Array.isArray(context.node.parameters.labels)?context.node.parameters.labels.map(String):[];
    if(labels.length<2)throw new M2MError('VALIDATION_ERROR','Text Classification requires at least two labels');
    const config=modelInput(context);
    const schema={type:'object',properties:{label:{type:'string',enum:labels},confidence:{type:'number'},reason:{type:'string'}},required:['label']};
    const textToClassify = resolveTextParam(context.node.parameters.text, context.input);
    const promptText = `Classify the following text into exactly ONE of the allowed labels:
Labels: ${labels.join(', ')}

Instructions: ${String(context.node.parameters.instructions || 'Choose exactly one label.')}

Text to classify:
${textToClassify}

You MUST return a JSON object with this exact structure:
{
  "label": "<must be one of: ${labels.join(', ')}>",
  "confidence": <number between 0.0 and 1.0>,
  "reason": "<brief rationale>"
}`;

    const result=await this.router.get(config.providerId).generateStructured({
      model:config.model,
      prompt:promptText,
      temperature:0,
      maxTokens:config.maxTokens,
      apiKey:config.apiKey,
      baseUrl:config.baseUrl,
      parse:(raw)=>{
        const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : { label: String(raw) };
        if (typeof value.confidence !== 'number' || Number.isNaN(value.confidence)) {
          value.confidence = 1.0;
        }
        if (!value.reason || typeof value.reason !== 'string') {
          value.reason = `Classified as ${String(value.label)}`;
        }
        const rawLabel = String(value.label ?? '').trim();
        const matchedLabel = labels.find((l) => l.toLowerCase() === rawLabel.toLowerCase()) ?? labels[0];
        value.label = matchedLabel;
        return validateSchema(value, schema);
      }
    });
    return{json:result};
  }
}

class InformationExtractionNode implements M2MNode{
  readonly type='ai.informationExtraction';readonly version=1;
  readonly metadata:NodeMetadata={type:this.type,version:1,displayName:'Information Extraction',category:'ai',icon:'scan-text',inputs:1,outputs:1,properties:[
    providerProperty,modelProperty,{name:'text',displayName:'Source text',type:'string',required:true},
    {name:'fields',displayName:'Fields',type:'json',required:true,default:[{name:'name',type:'string',description:'Person or organization name'}]},
  ]};
  constructor(private readonly router:ModelRouter){}
  async execute(context:NodeExecutionContext){
    const fields=Array.isArray(context.node.parameters.fields)?context.node.parameters.fields:[];
    const properties=Object.fromEntries(fields.map(item=>{const field=item as Record<string,unknown>;return[String(field.name),{type:String(field.type??'string'),description:field.description}];}));
    if(Object.keys(properties).length===0)throw new M2MError('VALIDATION_ERROR','Information Extraction requires fields');
    const schema={type:'object',properties};
    const config=modelInput(context);
    const textToExtract = resolveTextParam(context.node.parameters.text, context.input);
    const result=await this.router.get(config.providerId).generateStructured({
      model:config.model,
      prompt:`Extract the requested fields from this text into a JSON object conforming to the schema:\n${textToExtract}\n\nFields: ${Object.keys(properties).join(', ')}\nJSON Schema: ${JSON.stringify(schema)}`,
      temperature:0,
      maxTokens:config.maxTokens,
      apiKey:config.apiKey,
      baseUrl:config.baseUrl,
      parse:value=>validateSchema(value,schema)
    });
    return{json:result};
  }
}

class EmbeddingNode implements M2MNode{
  readonly type='ai.embedding';readonly version=1;
  readonly metadata:NodeMetadata={type:this.type,version:1,displayName:'Embedding',category:'ai',icon:'binary',inputs:1,outputs:1,properties:[
    providerProperty,{name:'model',displayName:'Embedding Model',type:'string',required:true,default:'nomic-embed-text'},{name:'text',displayName:'Text',type:'string',required:true},
  ]};
  constructor(private readonly router:ModelRouter){}
  async execute(context:NodeExecutionContext){const config=modelInput(context);const result=await this.router.get(config.providerId).embed({model:config.model,value:String(context.node.parameters.text),apiKey:config.apiKey,baseUrl:config.baseUrl});return{json:{...result,dimensions:result.embedding.length}};}
}

class SimpleMemoryNode implements M2MNode{
  readonly type='ai.simpleMemory';readonly version=1;
  readonly metadata:NodeMetadata={type:this.type,version:1,displayName:'Simple Memory',category:'ai',icon:'database',inputs:1,outputs:1,properties:[
    {name:'sessionKey',displayName:'Session Key',type:'string',required:true,default:'default'},
    {name:'operation',displayName:'Operation',type:'select',default:'append',options:[{label:'Append',value:'append'},{label:'Get',value:'get'},{label:'Set',value:'set'},{label:'Clear',value:'clear'}]},
    {name:'useInput',displayName:'Use node input',type:'boolean',default:true},{name:'value',displayName:'Value',type:'json',default:{}},{name:'maxMessages',displayName:'Maximum messages',type:'number',default:20},
  ]};
  async execute(context:NodeExecutionContext){if(!context.state)throw new M2MError('STATE_UNAVAILABLE','Persistent node state is unavailable');const key=`session:${String(context.node.parameters.sessionKey)}`;const operation=String(context.node.parameters.operation??'append');if(operation==='clear'){await context.state.delete(key);return{json:{history:[]}};}if(operation==='get')return{json:{history:(await context.state.get(key))??[]}};const value=context.node.parameters.useInput===false?context.node.parameters.value:context.input;if(operation==='set'){await context.state.set(key,value);return{json:{history:value}};}const current=await context.state.get(key);const history=Array.isArray(current)?current:[];const next=[...history,value].slice(-Math.max(1,Math.min(1000,Number(context.node.parameters.maxMessages??20))));await context.state.set(key,next);return{json:{history:next}};}
}

export function registerAINodes(registry: NodeRegistry, router: ModelRouter): void {
  [new AIPromptNode(router),new ChatModelNode(),new AIAgentNode(router),new AIToolNode(),new StructuredOutputNode(router),new TextClassificationNode(router),new InformationExtractionNode(router),new EmbeddingNode(router),new SimpleMemoryNode()]
    .forEach(node=>registry.register(node));
}

export * from './media-nodes.js';

