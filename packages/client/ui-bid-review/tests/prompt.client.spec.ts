/**
 * The two blocks of fixed copy and the prompt assembled around them. The review
 * question is this deployment's entire user-facing entry, and the output contract
 * names the three words the reviewing desk's seal can read, so both are pinned
 * verbatim, along with the assembled prompt's field order and the parse that
 * recovers the document path from the durable message the desk reads.
 */
import { describe, expect, it } from 'vitest'
import {
  BID_REVIEW_PRESET_QUESTION, BID_REVIEW_VERDICT_CONTRACT, buildBidReviewPrompt,
  parseBidReviewDocumentPath,
} from '../src/client/prompt.ts'

describe('buildBidReviewPrompt', () => {
  it('pins the fixed review question verbatim', () => {
    expect(BID_REVIEW_PRESET_QUESTION).toBe(
      '请审核该文件，第一，看标书是否符合公司主营业务（蔬菜、肉禽、蛋、奶、水产、干料、米、面、粮油、豆制品），'
      + '不符合直接说不符合给出原因，符合进入下一步，根据公司资格判断是否符合招标需求'
      + '（标书一般会写供应商资格等等相关内容），不符合给出原因，'
      + '符合再输出一下标书里面的评分准则，以及各种费用与周期',
    )
  })

  it('pins the output contract verbatim', () => {
    expect(BID_REVIEW_VERDICT_CONTRACT).toBe([
      '意见书的第一行必须单独成行，写作「判定：符合」「判定：不符合」「判定：待核验」三者之一，冒号后不得添加任何其他字词。',
      '招标要求中的硬性条件，凡公司资格记录既不能证实也不能否定的，判定一律写「待核验」，'
      + '并在正文中逐条列出缺少哪些资料、由谁出具；不得因为推测可能有而写「符合」，也不得因为查不到而写「不符合」。',
      '意见书正文全部使用中文。',
    ].join('\n'))
  })

  it('carries the document path and the qualifications after the question, in that order', () => {
    expect(buildBidReviewPrompt('C:\\dsh\\bid-documents\\1f-标书.pdf', '蔬菜配送资质，注册资金 500 万')).toBe([
      BID_REVIEW_PRESET_QUESTION,
      '',
      BID_REVIEW_VERDICT_CONTRACT,
      '',
      '标书文件：C:\\dsh\\bid-documents\\1f-标书.pdf',
      '',
      '公司资格：',
      '蔬菜配送资质，注册资金 500 万',
    ].join('\n'))
  })

  it('keeps the qualifications section when the shared record is still empty', () => {
    expect(buildBidReviewPrompt('/srv/bid-documents/1f-a.pdf', '')).toBe(
      `${BID_REVIEW_PRESET_QUESTION}\n\n${BID_REVIEW_VERDICT_CONTRACT}`
      + '\n\n标书文件：/srv/bid-documents/1f-a.pdf\n\n公司资格：\n',
    )
  })

  it('preserves a multiline qualifications record below its heading', () => {
    const prompt = buildBidReviewPrompt('/srv/a.pdf', '第一行\n第二行')

    expect(prompt.endsWith('公司资格：\n第一行\n第二行')).toBe(true)
  })
})

describe('parseBidReviewDocumentPath', () => {
  it('recovers the path out of a prompt this surface composed', () => {
    expect(parseBidReviewDocumentPath(buildBidReviewPrompt('/srv/bid-documents/1f-标书.pdf', '蔬菜配送资质')))
      .toBe('/srv/bid-documents/1f-标书.pdf')
    expect(parseBidReviewDocumentPath(buildBidReviewPrompt('C:\\dsh\\bid-documents\\2a-标书.docx', '')))
      .toBe('C:\\dsh\\bid-documents\\2a-标书.docx')
  })

  it('reports a message this surface did not compose', () => {
    expect(parseBidReviewDocumentPath('随便聊聊')).toBeNull()
    expect(parseBidReviewDocumentPath('')).toBeNull()
  })
})
