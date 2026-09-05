/**
 * The fixed review question and the prompt assembled around it. The question is
 * this deployment's entire user-facing entry, so it is pinned verbatim —
 * including its original doubled 出 — and the assembled prompt's field order is
 * pinned with it.
 */
import { describe, expect, it } from 'vitest'
import { BID_REVIEW_PRESET_QUESTION, buildBidReviewPrompt } from '../src/client/prompt.ts'

describe('buildBidReviewPrompt', () => {
  it('pins the fixed review question verbatim', () => {
    expect(BID_REVIEW_PRESET_QUESTION).toBe(
      '请审核该文件，第一，看标书是否符合公司主营业务（蔬菜、肉禽、蛋、奶、水产、干料、米、面、粮油、豆制品），'
      + '不符合直接说不符合给出原因，符合进入下一步，根据公司资格判断是否符合招标需求'
      + '（标书一般会写供应商资格等等相关内容），不符合给出出原因，'
      + '符合再输出一下标书里面的评分准则，以及各种费用与周期',
    )
  })

  it('carries the document path and the qualifications after the question, in that order', () => {
    expect(buildBidReviewPrompt('C:\\dsh\\bid-documents\\1f-标书.pdf', '蔬菜配送资质，注册资金 500 万')).toBe([
      BID_REVIEW_PRESET_QUESTION,
      '',
      '标书文件：C:\\dsh\\bid-documents\\1f-标书.pdf',
      '',
      '公司资格：',
      '蔬菜配送资质，注册资金 500 万',
    ].join('\n'))
  })

  it('keeps the qualifications section when the shared record is still empty', () => {
    expect(buildBidReviewPrompt('/srv/bid-documents/1f-a.pdf', '')).toBe(
      `${BID_REVIEW_PRESET_QUESTION}\n\n标书文件：/srv/bid-documents/1f-a.pdf\n\n公司资格：\n`,
    )
  })

  it('preserves a multiline qualifications record below its heading', () => {
    const prompt = buildBidReviewPrompt('/srv/a.pdf', '第一行\n第二行')

    expect(prompt.endsWith('公司资格：\n第一行\n第二行')).toBe(true)
  })
})
