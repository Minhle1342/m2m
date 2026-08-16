import type { WorkflowDefinition } from '@m2m/shared';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  definition: WorkflowDefinition;
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'local-flux-to-wan-video',
    name: 'Local FLUX.2 to Wan2.2 Video Pipeline',
    description: 'Generate high quality image using FLUX.2 Klein 4B, then animate it into a cinematic video with Wan2.2 TI2V-5B.',
    definition: {
      nodes: [
        {
          id: 'manual',
          type: 'trigger.manual',
          name: 'Manual Trigger',
          position: { x: 60, y: 160 },
          parameters: {}
        },
        {
          id: 'prompt-builder',
          type: 'm2m.ai.mediaPromptBuilder',
          name: 'Prompt & Camera Optimizer',
          position: { x: 300, y: 160 },
          parameters: {
            sceneDescription: 'A cyberpunk street in the rain with neon reflections and flying vehicles',
            style: 'cinematic cyberpunk, 8k, photorealistic, octane render',
            targetModel: 'flux'
          }
        },
        {
          id: 'gen-image',
          type: 'm2m.media.generateImage',
          name: 'FLUX.2 Klein 4B',
          position: { x: 560, y: 160 },
          parameters: {
            provider: 'comfyui',
            model: 'flux2-klein-4b',
            prompt: '{{$json.optimizedPrompt}}',
            width: 1024,
            height: 1024,
            steps: 25,
            guidance: 3.5
          }
        },
        {
          id: 'img-to-video',
          type: 'm2m.media.imageToVideo',
          name: 'Wan2.2 TI2V-5B',
          position: { x: 840, y: 160 },
          parameters: {
            provider: 'comfyui',
            model: 'wan2.2-ti2v-5b',
            sourceImage: '{{$json.media.previewUrl}}',
            prompt: 'Gentle rain falling, subtle camera dolly forward with ambient neon glow',
            durationSeconds: 5,
            fps: 24,
            motionStrength: 0.75
          }
        },
        {
          id: 'save-media',
          type: 'm2m.media.saveMedia',
          name: 'Save Video Asset',
          position: { x: 1120, y: 160 },
          parameters: {
            destination: 'local-disk',
            filenamePattern: 'cyberpunk_scene_{{timestamp}}'
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'manual', target: 'prompt-builder' },
        { id: 'e2', source: 'prompt-builder', target: 'gen-image' },
        { id: 'e3', source: 'gen-image', target: 'img-to-video' },
        { id: 'e4', source: 'img-to-video', target: 'save-media' }
      ],
      settings: { timeoutMs: 600000, saveExecutionProgress: true }
    }
  },
  {
    id: 'local-flux-image',
    name: 'Local FLUX.2 Klein 4B Image Generator',
    description: 'Generate high fidelity images locally on GPU/CPU with ComfyUI without API costs.',
    definition: {
      nodes: [
        {
          id: 'manual',
          type: 'trigger.manual',
          name: 'Manual Trigger',
          position: { x: 80, y: 160 },
          parameters: {}
        },
        {
          id: 'gen-image',
          type: 'm2m.media.generateImage',
          name: 'FLUX.2 Klein 4B',
          position: { x: 360, y: 160 },
          parameters: {
            provider: 'comfyui',
            model: 'flux2-klein-4b',
            prompt: 'Portrait of a futuristic astronaut in a glowing bioluminescent forest, highly detailed, photorealistic, 8k resolution',
            width: 1024,
            height: 1024,
            steps: 25,
            guidance: 3.5
          }
        },
        {
          id: 'save-media',
          type: 'm2m.media.saveMedia',
          name: 'Save Image Asset',
          position: { x: 660, y: 160 },
          parameters: {
            destination: 'local-disk',
            filenamePattern: 'astronaut_portrait_{{timestamp}}'
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'manual', target: 'gen-image' },
        { id: 'e2', source: 'gen-image', target: 'save-media' }
      ],
      settings: { timeoutMs: 300000, saveExecutionProgress: true }
    }
  },
  {
    id: 'media-storyboard-to-video',
    name: 'Creative Storyboard to Video Series',
    description: 'Decompose a narrative script into scene prompts and generate consistent visual shots.',
    definition: {
      nodes: [
        {
          id: 'manual',
          type: 'trigger.manual',
          name: 'Manual Trigger',
          position: { x: 60, y: 160 },
          parameters: {}
        },
        {
          id: 'storyboard',
          type: 'm2m.media.storyboardSplitter',
          name: 'Storyboard Splitter',
          position: { x: 320, y: 160 },
          parameters: {
            script: 'Scene 1: An ancient temple hidden in the dense jungle under morning mist.\nScene 2: An explorer steps into the golden light of the inner courtyard.',
            sceneCount: 2,
            style: 'cinematic fantasy adventure, hyperrealistic 8k'
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'manual', target: 'storyboard' }
      ],
      settings: { timeoutMs: 300000, saveExecutionProgress: true }
    }
  },
  {
    id: 'manual-transform',
    name: 'Manual data transform',
    description: 'Start manually, set data, then reshape the result.',
    definition: {
      nodes: [
        { id: 'manual', type: 'trigger.manual', name: 'Manual Trigger', position: { x: 80, y: 160 }, parameters: {} },
        { id: 'set', type: 'core.setData', name: 'Set Data', position: { x: 340, y: 160 }, parameters: { values: { message: 'Hello from m2m' }, keepInput: true } }
      ],
      edges: [{ id: 'manual-set', source: 'manual', target: 'set' }],
      settings: { timeoutMs: 300000, saveExecutionProgress: true }
    }
  },
  {
    id: 'webhook-ai-json',
    name: 'Webhook to structured AI',
    description: 'Receive a webhook, call an AI model, and return structured JSON.',
    definition: {
      nodes: [
        { id: 'webhook', type: 'trigger.webhook', name: 'Webhook', position: { x: 60, y: 160 }, parameters: { path: 'ai-json', method: 'POST' } },
        { id: 'prompt', type: 'ai.prompt', name: 'AI Prompt', position: { x: 320, y: 160 }, parameters: { provider: 'ollama', model: 'llama3.2', prompt: 'Summarize: {{$json.body}}', temperature: 0.2, maxTokens: 1024 } },
        { id: 'structured', type: 'ai.structuredOutput', name: 'Structured Output', position: { x: 580, y: 160 }, parameters: { provider: 'ollama', model: 'llama3.2', prompt: 'Return the summary as JSON.', schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] }, temperature: 0, maxTokens: 512 } },
        { id: 'respond', type: 'core.respondWebhook', name: 'Respond', position: { x: 840, y: 160 }, parameters: {} }
      ],
      edges: [
        { id: 'webhook-prompt', source: 'webhook', target: 'prompt' },
        { id: 'prompt-structured', source: 'prompt', target: 'structured' },
        { id: 'structured-respond', source: 'structured', target: 'respond' }
      ],
      settings: { timeoutMs: 300000, saveExecutionProgress: true }
    }
  }
];
