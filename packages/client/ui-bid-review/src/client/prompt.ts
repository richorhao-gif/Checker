/**
 * The one prompt this surface sends. Both the review question and the opinion
 * sheet's output contract are fixed product copy: the deployment replaces
 * free-form chat with a single bid-review request, so the text lives here
 * verbatim rather than in a dictionary (it is submitted to the model as a user
 * message, not rendered as chrome).
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/prompt
 */

/**
 * The fixed review question, sent verbatim as the head of every prompt this
 * surface submits.
 */
export const BID_REVIEW_PRESET_QUESTION =
  '请审核该文件，第一，看标书是否符合公司主营业务（蔬菜、肉禽、蛋、奶、水产、干料、米、面、粮油、豆制品），'
  + '不符合直接说不符合给出原因，符合进入下一步，根据公司资格判断是否符合招标需求'
  + '（标书一般会写供应商资格等等相关内容），不符合给出原因，'
  + '符合再输出一下标书里面的评分准则，以及各种费用与周期'

/**
 * The opinion sheet's output contract, sent after the question. The reviewing
 * desk reads its seal off the declaration line this requires, so the three
 * admissible words are the desk's whole verdict vocabulary: a requirement the
 * shared record can neither confirm nor refute is declared 待核验 and itemized,
 * because a two-word vocabulary leaves the model to soften such a case into
 * either neighbour and the seal cannot tell that wording apart.
 */
export const BID_REVIEW_VERDICT_CONTRACT =
  '意见书的第一行必须单独成行，写作「判定：符合」「判定：不符合」「判定：待核验」三者之一，'
  + '冒号后不得添加任何其他字词。\n'
  + '招标要求中的硬性条件，凡公司资格记录既不能证实也不能否定的，判定一律写「待核验」，'
  + '并在正文中逐条列出缺少哪些资料、由谁出具；'
  + '不得因为推测可能有而写「符合」，也不得因为查不到而写「不符合」。\n'
  + '意见书正文全部使用中文。'

/**
 * Compose the prompt for one uploaded bid document.
 * @param documentPath - absolute server path of the uploaded document, which
 * the Agent reads with its own file tools.
 * @param qualifications - the shared company-qualifications text.
 * @returns the fixed question, the output contract, the document path, and the
 * qualifications, in that order.
 */
export function buildBidReviewPrompt(documentPath: string, qualifications: string): string {
  return `${BID_REVIEW_PRESET_QUESTION}\n\n${BID_REVIEW_VERDICT_CONTRACT}`
    + `\n\n标书文件：${documentPath}\n\n公司资格：\n${qualifications}`
}

/** The submitted prompt's document line, the one field this surface parses back out. */
const DOCUMENT_LINE = /^标书文件：(.*)$/m

/**
 * Recover the document path from a prompt {@link buildBidReviewPrompt} composed.
 * The reviewing desk reads it out of the durable user message, because the
 * browser-side copy is dropped once the review is under way.
 * @param prompt - one submitted user message.
 * @returns the absolute server path, or null when the message is not one this
 * surface composed.
 */
export function parseBidReviewDocumentPath(prompt: string): string | null {
  return DOCUMENT_LINE.exec(prompt)?.[1] ?? null
}
