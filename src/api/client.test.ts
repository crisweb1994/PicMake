/** 只测试参数映射与 SSE 解析，不发网络请求。 */
import { describe, expect, it } from 'vitest'
import { createImageParser, editFormData, mapUsage, parseGenResponse } from './client'
import { ApiError, type EditSubmission, type ImageRequestResult } from '../lib/types'

const usage = {
  total_tokens: 600,
  input_tokens: 300,
  output_tokens: 300,
  input_tokens_details: { text_tokens: 100, image_tokens: 200 },
}
const submission: EditSubmission = {
  params: {
    model: 'flare',
    prompt: '添加一朵花',
    size: { w: 1024, h: 1024 },
    n: 2,
    quality: 'high',
    background: 'auto',
    outputFormat: 'webp',
  },
  sources: [
    {
      source: { generationId: 'parent', imageId: 'source' },
      image: {
        id: 'source',
        blob: new Blob(['source'], { type: 'image/jpeg' }),
        format: 'jpeg',
        width: 1,
        height: 1,
      },
    },
  ],
  inputFidelity: 'high',
}

describe('编辑请求映射', () => {
  it('multipart 保留来源格式、保真度和生成参数', () => {
    const body = editFormData(submission)
    expect(body.get('image')).toBeInstanceOf(Blob)
    expect((body.get('image') as File).name).toBe('source.jpg')
    expect((body.get('image') as File).type).toBe('image/jpeg')
    expect(Object.fromEntries([...body.entries()].filter(([key]) => key !== 'image'))).toEqual({
      model: 'gpt-image-2.5-flare',
      prompt: '添加一朵花',
      n: '2',
      size: '1024x1024',
      quality: 'high',
      background: 'auto',
      output_format: 'webp',
      input_fidelity: 'high',
      stream: 'true',
      partial_images: '3',
    })
  })
  it('多图按输入顺序使用 image[]', async () => {
    const multi: EditSubmission = {
      ...submission,
      sources: [
        ...submission.sources,
        {
          source: { imageId: 'second' },
          image: {
            id: 'second',
            blob: new Blob(['second'], { type: 'image/png' }),
            format: 'png',
            width: 1,
            height: 1,
          },
        },
      ],
    };
    const body = editFormData(multi);
    expect(body.has('image')).toBe(false);
    const images = body.getAll('image[]') as File[];
    expect(images.map((file) => file.type)).toEqual([
      'image/jpeg',
      'image/png',
    ]);
    expect(await Promise.all(images.map((file) => file.text()))).toEqual([
      'source',
      'second',
    ]);
    expect(body.get('n')).toBe('2');
  })
})

describe('请求级 usage', () => {
  it('多图 JSON 只保留一份根级 usage', () => {
    const result = parseGenResponse({
      data: [{ b64_json: 'a' }, { b64_json: 'b' }],
      usage,
    })
    expect(result.images).toHaveLength(2)
    expect(result.usage?.outputTokens).toBe(300)
    expect(result.images.every((image) => !('usage' in image))).toBe(true)
  })
  it('缺少输入明细不猜测 token 构成', () => {
    expect(mapUsage({ input_tokens: 300, output_tokens: 100 })).toMatchObject({
      inputTokens: 300,
      textTokens: 0,
      imageTokens: 0,
      inputDetailsAvailable: false,
    })
    expect(mapUsage(null)).toBeNull()
    expect(mapUsage({ output_tokens: 100, input_tokens_details: { text_tokens: 50 } })).toMatchObject({
      textTokens: 0,
      imageTokens: 0,
      inputDetailsAvailable: false,
    })
  })
  it('拒绝空结果及没有图片的响应', () => {
    expect(() => parseGenResponse({ data: [] })).toThrow()
    expect(() => parseGenResponse({ data: [{}] })).toThrow()
  })
})

describe('生成和编辑 SSE', () => {
  for (const endpoint of ['image_generation', 'image_edit']) {
    it(`${endpoint} 跨 chunk 预览、两张终稿和请求总量`, () => {
      const result: ImageRequestResult = { images: [], usage: null }
      const partials: string[] = []
      const parser = createImageParser({ onPartial: (b64) => partials.push(b64) }, result)
      const stream = [
        `event: ${endpoint}.partial_image\ndata: ${JSON.stringify({ b64_json: 'preview', partial_image_index: 1 })}\n\n`,
        `data: ${JSON.stringify({ type: `${endpoint}.completed`, b64_json: 'first', usage })}\n\n`,
        `data: ${JSON.stringify({ type: `${endpoint}.completed`, b64_json: 'second', usage })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
      for (let i = 0; i < stream.length; i += 7) parser.feed(stream.slice(i, i + 7))
      expect(partials).toEqual(['preview'])
      expect(result.images.map((image) => image.b64)).toEqual(['first', 'second'])
      expect(result.usage).toEqual(mapUsage(usage))
    })
  }
  it('保留流内内容政策错误的类别', () => {
    const parser = createImageParser({}, { images: [], usage: null })
    expect(() =>
      parser.feed('data: {"type":"error","code":"content_policy_violation","message":"policy"}\n\n'),
    ).toThrow(ApiError)
  })
})
