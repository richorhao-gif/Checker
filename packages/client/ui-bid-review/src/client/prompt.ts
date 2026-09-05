/**
 * The one prompt this surface sends. The question is fixed product copy: the
 * deployment replaces free-form chat with a single bid-review request, so the
 * text lives here verbatim rather than in a dictionary (it is submitted to the
 * model as a user message, not rendered as chrome).
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/prompt
 */

/**
 * The fixed review question, sent verbatim as the head of every prompt this
 * surface submits.
 */
export const BID_REVIEW_PRESET_QUESTION =
  '请审核该文件，第一，看标书是否符合公司主营业务（蔬菜、肉禽、蛋、奶、水产、干料、米、面、粮油、豆制品），'
  + '不符合直接说不符合给出原因，符合进入下一步，根据公司资格判断是否符合招标需求'
  + '（标书一般会写供应商资格等等相关内容），不符合给出出原因，'
  + '符合再输出一下标书里面的评分准则，以及各种费用与周期'

/**
 * Compose the prompt for one uploaded bid document.
 * @param documentPath - absolute server path of the uploaded document, which
 * the Agent reads with its own file tools.
 * @param qualifications - the shared company-qualifications text.
 * @returns the fixed question followed by the document path and the
 * qualifications, in that order.
 */
export function buildBidReviewPrompt(documentPath: string, qualifications: string): string {
  return `${BID_REVIEW_PRESET_QUESTION}\n\n标书文件：${documentPath}\n\n公司资格：\n${qualifications}`
}
