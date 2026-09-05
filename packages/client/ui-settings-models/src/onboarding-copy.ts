/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-09-05.1'

/** The complete editable welcome notice in both supported GUI locales. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: '欢迎使用标书审核',
    body: '本工具面向金龙鱼餐饮渠道的标书审核。每次审核上传一份标书文件，系统会先判断标书是否符合公司主营业务范围，再依据公司资格对照招标需求逐项审核，最后输出标书内的评分准则以及相关费用与周期。\n\n审核结论仅供参考，请结合公司资格与招标文件原文复核。',
    continueLabel: '继续',
  },
  en: {
    title: 'Welcome to Bid Review',
    body: "This tool reviews tender documents for the catering channel. Each review takes one bid file: it first checks whether the bid falls within the company's main lines of business, then reviews it against the tender requirements using the company qualifications, and finally outputs the scoring criteria, related fees, and timelines found in the document.\n\nReview conclusions are for reference only — verify them against the company qualifications and the original tender document.",
    continueLabel: 'Continue',
  },
} as const
