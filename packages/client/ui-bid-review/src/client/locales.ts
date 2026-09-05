/** `bidReview` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'composer.chooseWorkspace': '选择工作区后开始标书审核',
  'composer.dropHint': '将标书文件拖到此处，或使用下方按钮选择',
  'composer.pick': '选择标书文件',
  'composer.uploading': '正在上传标书文件…',
  'composer.repick': '重新选择',
  'composer.qualifications': '公司资格',
  'composer.qualificationsFilled': '已填写',
  'composer.qualificationsEmpty': '未填写',
  'composer.submit': '开始审核',
  'composer.sending': '正在提交…',
  'composer.locked': '该会话已提交标书审核',
  'composer.removed': '该会话已结束',
  'qualifications.description': '所有用户共享，保存在服务器上',
  'qualifications.aria': '公司资格',
  'qualifications.loading': '正在载入…',
  'qualifications.bytes': '{used} / {max}',
  'qualifications.tooLarge': '超出上限，请精简后再保存',
  'qualifications.updatedAt': '上次更新 {time}',
  'qualifications.save': '保存',
  'qualifications.cancel': '取消',
  'qualifications.close': '关闭',
  'error.qualificationsTooLarge': '公司资格超出上限（{actual}，上限 {max}）',
  'error.documentTooLarge': '标书文件超出上限（{actual}，上限 {max}）',
  'error.filenameBlank': '文件名不能为空',
  'error.filenameUnsafe': '文件名包含服务器不接受的字符',
  'error.contentInvalid': '文件内容读取失败，请重新选择',
  'error.generic': '操作失败：{detail}',
} satisfies Record<string, string>

/** The bidReview namespace key union. */
export type BidReviewKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The fixed-question bid-review surface's copy. */
    bidReview: BidReviewKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'composer.chooseWorkspace': 'Pick a workspace to start the bid review',
  'composer.dropHint': 'Drop the bid document here, or use the button below',
  'composer.pick': 'Choose bid document',
  'composer.uploading': 'Uploading the bid document…',
  'composer.repick': 'Choose another',
  'composer.qualifications': 'Company qualifications',
  'composer.qualificationsFilled': 'On file',
  'composer.qualificationsEmpty': 'Empty',
  'composer.submit': 'Start review',
  'composer.sending': 'Submitting…',
  'composer.locked': 'This conversation already submitted its bid review',
  'composer.removed': 'This conversation has ended',
  'qualifications.description': 'Shared by every user and stored on the server',
  'qualifications.aria': 'Company qualifications',
  'qualifications.loading': 'Loading…',
  'qualifications.bytes': '{used} / {max}',
  'qualifications.tooLarge': 'Over the limit; shorten it before saving',
  'qualifications.updatedAt': 'Last updated {time}',
  'qualifications.save': 'Save',
  'qualifications.cancel': 'Cancel',
  'qualifications.close': 'Close',
  'error.qualificationsTooLarge': 'Company qualifications exceed the limit ({actual}, limit {max})',
  'error.documentTooLarge': 'The bid document exceeds the limit ({actual}, limit {max})',
  'error.filenameBlank': 'The file name is empty',
  'error.filenameUnsafe': 'The file name contains characters the server rejects',
  'error.contentInvalid': 'Could not read the file content; choose it again',
  'error.generic': 'Operation failed: {detail}',
} satisfies Record<BidReviewKey, string>
