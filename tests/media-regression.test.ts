import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComfyUIMediaProvider } from '../packages/ai-core/src/media/providers/comfyui/comfyui-provider.js';
import { HuggingFaceMediaProvider } from '../packages/ai-core/src/media/providers/huggingface/huggingface-provider.js';
import { LocalMediaStorage } from '../packages/ai-core/src/media/storage/media-storage.js';
import { SaveMediaNode } from '../packages/nodes-ai/src/media-nodes.js';
import type { MediaFile } from '../packages/shared/src/index.js';

const upstreamVideo: MediaFile = {
  id: 'media_vid_real',
  type: 'video',
  mimeType: 'video/mp4',
  filename: 'generated.mp4',
  localPath: 'D:/media/generated.mp4',
  previewUrl: '/api/v1/media/assets/media_vid_real/content'
};

function nodeContext(parameters: Record<string, unknown>, input: unknown = undefined) {
  return {
    executionId: 'execution',
    workflowId: 'workflow',
    input,
    nodeOutputs: {},
    env: {},
    credentials: {},
    node: {
      id: 'save-media',
      type: 'm2m.media.saveMedia',
      name: 'Save Media',
      position: { x: 0, y: 0 },
      parameters
    },
    signal: new AbortController().signal
  } as any;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.COMFYUI_ENABLE_VIDEO_FALLBACK;
  delete process.env.COMFYUI_DISABLE_FALLBACK;
});

describe('media regressions', () => {
  it('prefers the legacy inputMedia value over a stale scalar media value', async () => {
    const result = await new SaveMediaNode().execute(
      nodeContext({ inputMedia: upstreamVideo, media: '1', destination: 'local-storage' })
    );

    expect((result.json as any).media).toMatchObject({
      id: 'media_vid_real',
      localPath: 'D:/media/generated.mp4'
    });
  });

  it('rejects unresolved scalar media IDs instead of creating an empty asset', async () => {
    await expect(new SaveMediaNode().execute(nodeContext({ media: '1' }))).rejects.toMatchObject({
      code: 'MEDIA_INVALID_INPUT'
    });
  });

  it('rejects empty paths and directories as media files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'm2m-media-'));
    try {
      const storage = new LocalMediaStorage(directory);
      expect(() => storage.getFilePath('')).toThrowError(/path is empty/i);
      expect(() => storage.getFilePath(directory)).toThrowError(/not found on disk/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not return the demo MP4 when ComfyUI is offline by default', async () => {
    const saveMedia = vi.fn();
    const storage = { saveMedia } as unknown as LocalMediaStorage;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection refused')));

    const provider = new ComfyUIMediaProvider(storage);
    await expect(
      provider.generateVideo({
        model: 'wan2.2-ti2v-5b',
        prompt: 'camera moves forward',
        inputImage: 'data:image/png;base64,iVBORw0KGgo='
      })
    ).rejects.toMatchObject({ code: 'MEDIA_PROVIDER_UNAVAILABLE' });
    expect(saveMedia).not.toHaveBeenCalled();
  });

  it('explains when the configured ComfyUI server is not listening', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })
    ));
    const provider = new ComfyUIMediaProvider({} as LocalMediaStorage);

    await expect(provider.diagnoseHealth({
      type: 'comfyui',
      data: { baseUrl: 'http://127.0.0.1:8188' }
    })).resolves.toMatchObject({
      healthy: false,
      endpoint: 'http://127.0.0.1:8188/system_stats',
      message: expect.stringMatching(/no ComfyUI server is listening/i)
    });
  });

  it('rejects a non-ComfyUI server that returns HTML with HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('<!doctype html><title>m2m</title>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      })
    ));
    const provider = new ComfyUIMediaProvider({} as LocalMediaStorage);

    await expect(provider.diagnoseHealth({
      type: 'comfyui',
      data: { baseUrl: 'http://127.0.0.1:5173' }
    })).resolves.toMatchObject({
      healthy: false,
      message: expect.stringMatching(/not the ComfyUI API/i)
    });
  });

  it('submits the official native Wan2.2 node graph when ComfyUI is online', async () => {
    let submittedPrompt: Record<string, any> | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/system_stats')) {
        return Response.json({ system: { comfyui_version: 'test' }, devices: [] });
      }
      if (url.endsWith('/upload/image')) {
        return Response.json({ name: 'uploaded-input.png' });
      }
      if (url.endsWith('/prompt')) {
        submittedPrompt = JSON.parse(String(init?.body)).prompt;
        return Response.json({ prompt_id: 'prompt-1' });
      }
      if (url.endsWith('/history/prompt-1')) {
        return Response.json({
          'prompt-1': {
            outputs: {
              '12': { videos: [{ filename: 'm2m_wan2_2_00001.mp4', subfolder: 'video', type: 'output' }] }
            },
            status: { status_str: 'success', completed: true }
          }
        });
      }
      if (url.includes('/view?')) return new Response(new Uint8Array([0, 0, 0, 24]), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const savedVideo: MediaFile = {
      id: 'media_vid_generated',
      type: 'video',
      mimeType: 'video/mp4',
      filename: 'm2m_wan2_2_00001.mp4',
      localPath: 'D:/media/m2m_wan2_2_00001.mp4'
    };
    const storage = {
      saveMedia: vi.fn().mockResolvedValue(savedVideo),
      getFilePath: vi.fn()
    } as unknown as LocalMediaStorage;

    const result = await new ComfyUIMediaProvider(storage).generateVideo({
      model: 'wan2.2-ti2v-5b',
      prompt: 'camera moves forward',
      negativePrompt: 'flicker',
      durationSeconds: 5,
      fps: 24,
      steps: 20,
      inputImage: 'data:image/png;base64,iVBORw0KGgo='
    });

    expect(result).toEqual(savedVideo);
    expect(Object.values(submittedPrompt || {}).map((node) => node.class_type)).toEqual(
      expect.arrayContaining([
        'UNETLoader',
        'Wan22ImageToVideoLatent',
        'KSampler',
        'CreateVideo',
        'SaveVideo'
      ])
    );
    expect(Object.values(submittedPrompt || {}).map((node) => node.class_type)).not.toContain(
      'WanImageToVideoSampler'
    );
    expect(submittedPrompt?.['8'].inputs).toMatchObject({ length: 121, batch_size: 1 });
  });

  it('routes image-to-video through Hugging Face Inference Providers without local GPU inference', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'm2m-hf-video-'));
    try {
      const inputPath = join(directory, 'input.png');
      writeFileSync(inputPath, Buffer.from([137, 80, 78, 71]));
      const imageToVideo = vi.fn().mockResolvedValue(
        new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'video/mp4' })
      );
      const provider = new HuggingFaceMediaProvider(
        new LocalMediaStorage(directory),
        () => ({ imageToVideo, textToImage: vi.fn() } as any)
      );

      const result = await provider.generateVideo(
        {
          model: 'hf-ltx-video-i2v',
          prompt: 'slow cinematic camera movement',
          negativePrompt: 'flicker',
          inputImage: {
            id: 'media_ima_source',
            type: 'image',
            mimeType: 'image/png',
            filename: 'input.png',
            localPath: inputPath
          },
          durationSeconds: 5,
          fps: 24,
          steps: 8
        },
        { type: 'huggingface', data: { apiKey: 'hf_test' } }
      );

      expect(imageToVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'Lightricks/LTX-Video-0.9.8-13B-distilled',
          provider: 'fal-ai',
          inputs: expect.any(Blob),
          parameters: expect.objectContaining({
            prompt: 'slow cinematic camera movement',
            num_frames: 113,
            resolution: '480p',
            enable_detail_pass: false
          })
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(result).toMatchObject({
        type: 'video',
        mimeType: 'video/mp4',
        provider: 'huggingface',
        model: 'hf-ltx-video-i2v'
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
