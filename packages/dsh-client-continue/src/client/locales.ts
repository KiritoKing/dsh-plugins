/** User-visible copy; submitted prompt text is intentionally not translated. */
export const en = {
  continue: 'Continue',
  command: 'Continue interrupted conversation',
  busy: 'Wait for the current request, queue, or interaction to finish',
  draft: 'Send or clear the current draft and attachments first',
  credentials: 'Check provider credentials or quota before continuing',
  failed: 'Continue was not confirmed. Check the conversation before sending again.',
}
export type ContinueKey = keyof typeof en
export const zh: Record<ContinueKey, string> = {
  continue: '继续',
  command: '继续中断的会话',
  busy: '请等待当前请求、排队消息或交互结束',
  draft: '请先发送或清空草稿和附件',
  credentials: '请先检查模型凭据或额度',
  failed: '未确认继续成功，请检查会话后再发送。',
}
